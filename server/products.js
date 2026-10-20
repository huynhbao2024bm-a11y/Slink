'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { allowedWarehouseIds, findAccessibleWarehouse } = require('./warehouse-access');

const EDIT_ROLES = new Set(['owner', 'manager', 'stockkeeper']);
const PRICE_HISTORY_READ_ROLES = new Set(['owner', 'manager', 'stockkeeper', 'accountant']);
const MAX_VND = Number.MAX_SAFE_INTEGER;
const MAX_BIGINT = 9223372036854775807n;

function canonicalQuantityText(value) {
  const match = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(String(value));
  if (!match) return String(value);
  const whole = BigInt(match[1]).toString();
  const fraction = (match[2] || '').replace(/0+$/, '');
  return whole + (fraction ? `.${fraction}` : '');
}

function requireEditor(role) {
  if (!EDIT_ROLES.has(role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền quản lý sản phẩm.');
}

function validateProduct(input, { partial = false } = {}) {
  const source = input || {};
  const values = {};
  const textFields = [
    ['sku', 1, 80], ['name', 1, 240], ['category', 1, 120], ['unit', 1, 40],
  ];
  for (const [key, min, max] of textFields) {
    if (partial && source[key] === undefined) continue;
    const defaultValue = key === 'category' ? 'Chưa phân loại' : key === 'unit' ? 'cái' : '';
    const value = typeof source[key] === 'string' ? source[key].trim() : (!partial ? defaultValue : '');
    if (value.length < min || value.length > max) throw new ApiError(400, 'validation_error', 'Hãy kiểm tra mã, tên, danh mục và đơn vị sản phẩm.');
    values[key] = value;
  }
  for (const key of ['salePriceVnd', 'costVnd']) {
    if (partial && source[key] === undefined) continue;
    const value = source[key] === undefined && !partial ? 0 : source[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VND) throw new ApiError(400, 'validation_error', 'Giá bán và giá vốn phải là số VND nguyên không âm.');
    values[key] = value;
  }
  if (!partial || source.lowStockThreshold !== undefined) {
    const thresholdText = String(source.lowStockThreshold ?? 0);
    const thresholdMatch = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(thresholdText);
    const threshold = Number(thresholdText);
    if (!thresholdMatch || !Number.isFinite(threshold) || threshold < 0) {
      throw new ApiError(400, 'validation_error', 'Ngưỡng tồn kho phải là số lượng không âm, tối đa 3 chữ số thập phân.');
    }
    values.lowStockThreshold = threshold;
  }
  if (!partial || source.barcode !== undefined) {
    const barcode = source.barcode === undefined || source.barcode === null || source.barcode === '' ? null : String(source.barcode).trim();
    if (barcode !== null && (barcode.length < 3 || barcode.length > 80)) throw new ApiError(400, 'validation_error', 'Mã vạch phải có từ 3 đến 80 ký tự.');
    values.barcode = barcode;
  }
  if (!partial || source.inventoryTracked !== undefined) {
    const tracked = source.inventoryTracked ?? true;
    if (typeof tracked !== 'boolean') throw new ApiError(400, 'validation_error', 'Cấu hình theo dõi tồn kho không hợp lệ.');
    values.inventoryTracked = tracked;
  }
  return values;
}

function conflict(error) {
  if (error.code === '23505') throw new ApiError(409, 'product_conflict', 'Mã sản phẩm hoặc mã vạch đã được sử dụng trong cửa hàng này.');
  throw error;
}

function validateImportRows(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) {
    throw new ApiError(400, 'validation_error', 'Tệp nhập cần có từ 1 đến 200 dòng sản phẩm.');
  }
  const seenSkus = new Map();
  const seenBarcodes = new Map();
  return input.map((row, index) => {
    const line = Number.isSafeInteger(row?.sourceLine) && row.sourceLine >= 2 && row.sourceLine <= 1_000_000
      ? row.sourceLine
      : index + 2;
    if (!row || typeof row !== 'object' || Array.isArray(row) || !Object.hasOwn(row, 'salePriceVnd')) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: cần khai báo giá bán VND nguyên không âm.`);
    }
    let product;
    try {
      product = validateProduct(row);
    } catch (error) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: ${error.message}`);
    }
    const rawOpeningQuantity = row?.openingQuantity === undefined || row.openingQuantity === '' ? '0' : String(row.openingQuantity).trim();
    const quantityMatch = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(rawOpeningQuantity);
    const openingQuantity = Number(rawOpeningQuantity);
    if (!quantityMatch || !Number.isFinite(openingQuantity) || openingQuantity < 0 || openingQuantity > 9_999_999_999.999) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: tồn đầu kỳ phải không âm và có tối đa 3 chữ số thập phân.`);
    }
    if (!product.inventoryTracked && openingQuantity !== 0) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: sản phẩm không theo dõi tồn kho phải có tồn đầu kỳ bằng 0.`);
    }
    const normalizedSku = product.sku.toLocaleLowerCase('vi');
    if (seenSkus.has(normalizedSku)) throw new ApiError(400, 'duplicate_import_sku', `Dòng ${line}: mã SKU bị trùng với dòng ${seenSkus.get(normalizedSku)} trong tệp.`);
    seenSkus.set(normalizedSku, line);
    if (product.barcode !== null) {
      if (seenBarcodes.has(product.barcode)) throw new ApiError(400, 'duplicate_import_barcode', `Dòng ${line}: mã vạch bị trùng với dòng ${seenBarcodes.get(product.barcode)} trong tệp.`);
      seenBarcodes.set(product.barcode, line);
    }
    const wholeQuantity = quantityMatch[1].replace(/^0+(?=\d)/, '');
    const fractionQuantity = (quantityMatch[2] || '').replace(/0+$/, '');
    const openingQuantityText = wholeQuantity + (fractionQuantity ? `.${fractionQuantity}` : '');
    return { ...product, openingQuantity, openingQuantityText, sourceLine: line };
  });
}

function describeImportConflict(products, existingRows) {
  if (!existingRows.length) return null;
  const skuConflicts = new Map(existingRows.map((product) => [product.sku_normalized, product.sku]));
  const barcodeConflicts = new Set(existingRows.map((product) => product.barcode).filter(Boolean));
  const conflictProduct = products.find((product) => skuConflicts.has(product.sku.toLocaleLowerCase('vi')) || (product.barcode && barcodeConflicts.has(product.barcode)));
  if (!conflictProduct) return null;
  const normalizedSku = conflictProduct.sku.toLocaleLowerCase('vi');
  const conflictingValue = skuConflicts.has(normalizedSku)
    ? `SKU ${skuConflicts.get(normalizedSku)}`
    : `mã vạch ${conflictProduct.barcode}`;
  return `Dòng ${conflictProduct.sourceLine}: ${conflictingValue} đã có trong cửa hàng. Không có dòng nào được nhập.`;
}

function validateBulkUpdateRows(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) {
    throw new ApiError(400, 'validation_error', 'Mỗi lần cập nhật cần có từ 1 đến 200 dòng sản phẩm.');
  }
  const seenIds = new Map();
  return input.map((row, index) => {
    const line = Number.isSafeInteger(row?.sourceLine) && row.sourceLine >= 2 && row.sourceLine <= 1_000_000
      ? row.sourceLine
      : index + 2;
    if (!row || typeof row !== 'object' || Array.isArray(row) || !UUID_PATTERN.test(String(row.productId || ''))) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: mã sản phẩm không hợp lệ.`);
    }
    const allowedFields = new Set(['productId', 'version', 'sourceLine', 'sku', 'barcode', 'clearBarcode', 'name', 'category', 'unit', 'salePriceVnd', 'costVnd', 'lowStockThreshold']);
    const unsupportedField = Object.keys(row).find((key) => !allowedFields.has(key));
    if (unsupportedField) throw new ApiError(400, 'validation_error', `Dòng ${line}: trường ${unsupportedField} chưa được hỗ trợ trong cập nhật CSV.`);
    const productId = String(row.productId).toLowerCase();
    if (seenIds.has(productId)) throw new ApiError(400, 'duplicate_product_update', `Dòng ${line}: sản phẩm đã xuất hiện ở dòng ${seenIds.get(productId)}.`);
    seenIds.set(productId, line);
    if (!Number.isSafeInteger(row.version) || row.version < 1) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: thiếu phiên bản dữ liệu hợp lệ. Hãy tải lại CSV sản phẩm trước khi sửa.`);
    }

    const update = { productId, version: row.version, sourceLine: line };
    for (const [key, min, max] of [['sku', 1, 80], ['name', 1, 240], ['category', 1, 120], ['unit', 1, 40]]) {
      if (row[key] === undefined || row[key] === null || row[key] === '') continue;
      if (typeof row[key] !== 'string') throw new ApiError(400, 'validation_error', `Dòng ${line}: ${key} không hợp lệ.`);
      const value = row[key].trim();
      if (value.length < min || value.length > max) throw new ApiError(400, 'validation_error', `Dòng ${line}: ${key} có độ dài không hợp lệ.`);
      update[key] = value;
    }
    if (row.barcode !== undefined && row.barcode !== null && row.barcode !== '') {
      if (typeof row.barcode !== 'string') throw new ApiError(400, 'validation_error', `Dòng ${line}: mã vạch không hợp lệ.`);
      const barcode = row.barcode.trim();
      if (barcode.length < 3 || barcode.length > 80) throw new ApiError(400, 'validation_error', `Dòng ${line}: mã vạch phải có từ 3 đến 80 ký tự.`);
      update.barcode = barcode;
    }
    if (row.clearBarcode !== undefined) {
      if (row.clearBarcode !== true || update.barcode !== undefined) {
        throw new ApiError(400, 'validation_error', `Dòng ${line}: chỉ được cập nhật hoặc xóa mã vạch, không thể dùng cả hai.`);
      }
      update.clearBarcode = true;
    }
    for (const key of ['salePriceVnd', 'costVnd']) {
      if (row[key] === undefined || row[key] === null || row[key] === '') continue;
      if (!Number.isSafeInteger(row[key]) || row[key] < 0 || row[key] > MAX_VND) {
        throw new ApiError(400, 'validation_error', `Dòng ${line}: giá phải là số VND nguyên không âm.`);
      }
      update[key] = row[key];
    }
    if (row.lowStockThreshold !== undefined && row.lowStockThreshold !== null && row.lowStockThreshold !== '') {
      const thresholdText = String(row.lowStockThreshold).trim();
      if (!/^\d{1,11}(?:\.\d{1,3})?$/.test(thresholdText)) {
        throw new ApiError(400, 'validation_error', `Dòng ${line}: ngưỡng tồn phải không âm và có tối đa 3 chữ số thập phân.`);
      }
      update.lowStockThreshold = canonicalQuantityText(thresholdText);
    }
    if (!['sku', 'name', 'category', 'unit', 'barcode', 'clearBarcode', 'salePriceVnd', 'costVnd', 'lowStockThreshold'].some((key) => Object.hasOwn(update, key))) {
      throw new ApiError(400, 'validation_error', `Dòng ${line}: cần có ít nhất một giá trị muốn cập nhật.`);
    }
    return update;
  });
}

function describeBulkUpdateConflict(items, existingRows) {
  const byId = new Map(items.map((item) => [item.productId, item]));
  const nextSkus = new Map();
  const nextBarcodes = new Map();
  for (const row of existingRows) {
    const item = byId.get(row.id);
    const sku = item?.sku ? item.sku.toLocaleLowerCase('vi') : row.sku_normalized;
    const barcode = item?.clearBarcode ? null : (item?.barcode !== undefined ? item.barcode : row.barcode);
    if (nextSkus.has(sku) && nextSkus.get(sku) !== row.id) {
      const duplicate = byId.get(row.id) || byId.get(nextSkus.get(sku));
      return `Dòng ${duplicate?.sourceLine || '?'}: SKU sau cập nhật bị trùng trong tệp. Không có dòng nào được cập nhật.`;
    }
    nextSkus.set(sku, row.id);
    if (barcode) {
      if (nextBarcodes.has(barcode) && nextBarcodes.get(barcode) !== row.id) {
        const duplicate = byId.get(row.id) || byId.get(nextBarcodes.get(barcode));
        return `Dòng ${duplicate?.sourceLine || '?'}: mã vạch sau cập nhật bị trùng trong tệp. Không có dòng nào được cập nhật.`;
      }
      nextBarcodes.set(barcode, row.id);
    }
  }
  return null;
}

function registerProductRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/products', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const limit = Math.min(Math.max(Number.parseInt(request.query?.limit || '50', 10) || 50, 1), 100);
    const offset = Math.min(Math.max(Number.parseInt(request.query?.offset || '0', 10) || 0, 0), 10000);
    const search = typeof request.query?.q === 'string' ? request.query.q.trim().slice(0, 120) : '';
    const status = request.query?.status === 'archived' ? 'archived' : 'active';
    const requestedWarehouseId = request.query?.warehouseId;
    if (requestedWarehouseId !== undefined && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const canViewCost = ['owner', 'manager', 'stockkeeper', 'accountant'].includes(membership.role);
      if (requestedWarehouseId && !await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId)) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      const warehouseIds = allowedWarehouseIds(membership);
      const result = await client.query(
        `SELECT p.id, p.sku, p.barcode, p.name, p.category, p.unit,
                p.sale_price_vnd::text AS sale_price_vnd,
                CASE WHEN $5::boolean THEN p.cost_vnd::text ELSE NULL END AS cost_vnd,
                p.low_stock_threshold::text AS low_stock_threshold, p.inventory_tracked,
                p.status, p.version, COALESCE(i.on_hand, 0)::text AS on_hand,
                COALESCE(i.reserved, 0)::text AS reserved, COALESCE(i.version, 1)::int AS inventory_version,
                p.updated_at, COUNT(*) OVER()::int AS total_count
         FROM products p
         LEFT JOIN LATERAL (
           SELECT SUM(b.on_hand) FILTER (WHERE ($6::uuid IS NULL OR b.warehouse_id = $6) AND ($7::uuid[] IS NULL OR b.warehouse_id = ANY($7))) AS on_hand,
                  SUM(b.reserved) FILTER (WHERE ($6::uuid IS NULL OR b.warehouse_id = $6) AND ($7::uuid[] IS NULL OR b.warehouse_id = ANY($7))) AS reserved,
                  MAX(b.version) FILTER (WHERE ($6::uuid IS NULL OR b.warehouse_id = $6) AND ($7::uuid[] IS NULL OR b.warehouse_id = ANY($7))) AS version
           FROM inventory_balances b WHERE b.store_id = p.store_id AND b.product_id = p.id
         ) i ON true
         WHERE p.status = $1 AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.sku_normalized LIKE '%' || lower($2) || '%' OR p.barcode = $2)
         ORDER BY p.name, p.id LIMIT $3 OFFSET $4`,
        [status, search, limit + 1, offset, canViewCost, requestedWarehouseId || null, warehouseIds]
      );
      const hasMore = result.rows.length > limit;
      return { products: result.rows.slice(0, limit), total: Number(result.rows[0]?.total_count || 0), nextOffset: hasMore ? offset + limit : null };
    });
  });

  app.get('/api/stores/:storeId/products/:productId/price-history', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    const rawLimit = request.query?.limit === undefined ? '30' : request.query.limit;
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) throw new ApiError(400, 'validation_error', 'Số dòng lịch sử không hợp lệ.');
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new ApiError(400, 'validation_error', 'Mỗi trang lịch sử chỉ được từ 1 đến 50 dòng.');
    const rawBefore = request.query?.before;
    let before = null;
    if (rawBefore !== undefined) {
      if (typeof rawBefore !== 'string' || !/^[1-9]\d{0,18}$/.test(rawBefore) || BigInt(rawBefore) > MAX_BIGINT) {
        throw new ApiError(400, 'validation_error', 'Mốc trang lịch sử không hợp lệ.');
      }
      before = rawBefore;
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!PRICE_HISTORY_READ_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Vai trò của bạn không được xem lịch sử giá sản phẩm.');
      const product = await client.query(
        `SELECT p.id, p.sku, p.name, p.sale_price_vnd::text AS current_price_vnd,
                EXISTS (SELECT 1 FROM product_sale_price_history h
                        WHERE h.store_id = p.store_id AND h.product_id = p.id
                          AND h.source_type = 'migration_baseline') AS has_migration_baseline
         FROM products p WHERE p.store_id = $1 AND p.id = $2`,
        [storeId, productId]
      );
      if (!product.rowCount) throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm trong cửa hàng này.');
      const result = await client.query(
        `SELECT h.id::text AS id, h.previous_price_vnd::text AS previous_price_vnd,
                h.new_price_vnd::text AS new_price_vnd, h.source_type, h.source_id,
                h.created_at, u.display_name AS actor_name
         FROM product_sale_price_history h
         LEFT JOIN users u ON u.id = h.actor_user_id
         WHERE h.store_id = $1 AND h.product_id = $2 AND ($3::bigint IS NULL OR h.id < $3::bigint)
         ORDER BY h.id DESC LIMIT $4`,
        [storeId, productId, before, limit + 1]
      );
      const hasMore = result.rows.length > limit;
      const history = result.rows.slice(0, limit);
      return {
        product: product.rows[0],
        history,
        nextCursor: hasMore ? history[history.length - 1].id : null,
        historyStartsAtMigrationBaseline: product.rows[0].has_migration_baseline,
      };
    });
  });

  app.post('/api/stores/:storeId/products/import/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const products = validateImportRows(request.body?.items);
    const skuValues = products.map((product) => product.sku.toLocaleLowerCase('vi'));
    const barcodeValues = products.map((product) => product.barcode).filter(Boolean);
    const requestedWarehouseId = request.body?.warehouseId;
    if (requestedWarehouseId !== undefined && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) throw new ApiError(400, 'validation_error', 'Kho nhận tồn đầu kỳ không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId?.toLowerCase() || null);
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận tồn đầu kỳ đang hoạt động.');
      const existing = await client.query(
        `SELECT sku, sku_normalized, barcode FROM products
         WHERE store_id = $1 AND (sku_normalized = ANY($2::text[]) OR barcode = ANY($3::text[]))`,
        [storeId, skuValues, barcodeValues]
      );
      const conflictMessage = describeImportConflict(products, existing.rows);
      return {
        valid: !conflictMessage,
        count: products.length,
        conflict: conflictMessage,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name
      };
    });
  });

  app.post('/api/stores/:storeId/products/import', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const products = validateImportRows(request.body?.items);
    const warehouseInput = request.body?.warehouseId;
    if (warehouseInput !== undefined && (typeof warehouseInput !== 'string' || !UUID_PATTERN.test(warehouseInput))) throw new ApiError(400, 'validation_error', 'Kho nhận tồn đầu kỳ không hợp lệ.');
    const requestedWarehouseId = warehouseInput?.toLowerCase() || null;
    const importId = randomUUID();
    const skuValues = products.map((product) => product.sku.toLocaleLowerCase('vi'));
    const barcodeValues = products.map((product) => product.barcode).filter(Boolean);
    try {
      const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId, { lock: true });
        if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận tồn đầu kỳ đang hoạt động.');
        const requestHash = createHash('sha256').update(JSON.stringify(
          requestedWarehouseId ? { items: products, warehouseId: requestedWarehouseId } : products
        )).digest();
        const reserved = await client.query(
          `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
          [storeId, auth.userId, idempotencyKey, requestHash]
        );
        if (!reserved.rowCount) {
          const previous = await client.query(
            `SELECT request_hash, response_status, response_body FROM idempotency_records
             WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
            [storeId, auth.userId, idempotencyKey]
          );
          const record = previous.rows[0];
          if (!record || !Buffer.from(record.request_hash).equals(requestHash)) throw new ApiError(409, 'idempotency_conflict', 'Mã nhập đã được dùng cho bộ dữ liệu khác.');
          if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Tệp nhập đang được xử lý. Hãy thử lại sau.');
          return { status: record.response_status, body: record.response_body, replayed: true };
        }

        const existing = await client.query(
          `SELECT sku, sku_normalized, barcode FROM products
           WHERE store_id = $1 AND (sku_normalized = ANY($2::text[]) OR barcode = ANY($3::text[]))`,
          [storeId, skuValues, barcodeValues]
        );
        const conflictMessage = describeImportConflict(products, existing.rows);
        if (conflictMessage) throw new ApiError(409, 'product_conflict', conflictMessage);

        const createdProducts = [];
        for (const product of products) {
          const inserted = await client.query(
            `INSERT INTO products (
               store_id, sku, sku_normalized, barcode, name, category, unit,
               sale_price_vnd, cost_vnd, low_stock_threshold, inventory_tracked, created_by
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, sku, barcode, name, category, unit, sale_price_vnd::text AS sale_price_vnd,
                       cost_vnd::text AS cost_vnd, low_stock_threshold::text AS low_stock_threshold,
                       inventory_tracked, status, version, created_at`,
            [storeId, product.sku, product.sku.toLocaleLowerCase('vi'), product.barcode, product.name,
              product.category, product.unit, product.salePriceVnd, product.costVnd,
              product.lowStockThreshold, product.inventoryTracked, auth.userId]
          );
          const created = inserted.rows[0];
          await client.query(
            `INSERT INTO product_sale_price_history (store_id, product_id, previous_price_vnd, new_price_vnd, source_type, source_id, actor_user_id)
             VALUES ($1, $2, NULL, $3, 'csv_import', $4, $5)`,
            [storeId, created.id, product.salePriceVnd, importId, auth.userId]
          );
          const openingQuantity = product.openingQuantityText;
          await client.query(
            `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand)
             SELECT $1, w.id, $2, CASE WHEN w.id = $3 THEN $4::numeric ELSE 0 END
             FROM warehouses w WHERE w.store_id = $1 AND w.status = 'active'`,
            [storeId, created.id, warehouse.id, openingQuantity]
          );
          if (product.costVnd > 0) {
            await client.query(
              `INSERT INTO product_cost_history (store_id, product_id, unit_cost_vnd, source_type, source_id, actor_user_id)
               VALUES ($1, $2, $3, 'opening_balance', $4, $5)`,
              [storeId, created.id, product.costVnd, importId, auth.userId]
            );
          }
          if (product.openingQuantity > 0) {
            await client.query(
              `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity_delta, quantity_after,
                                                 reason, source_type, source_id, actor_user_id, warehouse_id)
               VALUES ($1, $2, 'opening', $3::numeric, $3::numeric, 'Tồn đầu kỳ khi nhập danh mục', 'opening_import', $4, $5, $6)`,
              [storeId, created.id, openingQuantity, importId, auth.userId, warehouse.id]
            );
          }
          await client.query(
            `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'product.created', 'product', $3, jsonb_build_object('sku', $4::text, 'openingQuantity', $5::text, 'importId', $6::text, 'warehouseId', $7::text))`,
            [storeId, auth.userId, created.id, created.sku, openingQuantity, importId, warehouse.id]
          );
          createdProducts.push({ ...created, on_hand: openingQuantity, reserved: '0', import_id: importId, warehouse_id: warehouse.id, warehouse_name: warehouse.name });
        }
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'products.imported', 'product_import', $3, jsonb_build_object('count', $4::integer))`,
          [storeId, auth.userId, importId, createdProducts.length]
        );
        const body = { importId, count: createdProducts.length, warehouseId: warehouse.id, warehouseName: warehouse.name, products: createdProducts };
        await client.query(
          `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
          [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
        );
        return { status: 201, body, replayed: false };
      });
      if (outcome.replayed) reply.header('idempotent-replayed', 'true');
      return reply.code(outcome.status).send(outcome.body);
    } catch (error) {
      if (error.code === '23505') {
        const conflictMessage = await withStore(pool, auth.userId, storeId, async (client, membership) => {
          requireEditor(membership.role);
          const existing = await client.query(
            `SELECT sku, sku_normalized, barcode FROM products
             WHERE store_id = $1 AND (sku_normalized = ANY($2::text[]) OR barcode = ANY($3::text[]))`,
            [storeId, skuValues, barcodeValues]
          );
          return describeImportConflict(products, existing.rows);
        });
        if (conflictMessage) throw new ApiError(409, 'product_conflict', conflictMessage);
      }
      return conflict(error);
    }
  });

  app.post('/api/stores/:storeId/products/bulk-update/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const items = validateBulkUpdateRows(request.body?.items);
    const productIds = items.map((item) => item.productId);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const selected = await client.query(
        `SELECT id, sku, sku_normalized, barcode, name, category, unit,
                sale_price_vnd::text AS sale_price_vnd, cost_vnd::text AS cost_vnd,
                low_stock_threshold::text AS low_stock_threshold, status, version
         FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id`,
        [storeId, productIds]
      );
      const selectedById = new Map(selected.rows.map((row) => [row.id, row]));
      for (const item of items) {
        const current = selectedById.get(item.productId);
        if (!current || current.status !== 'active') {
          return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: không tìm thấy sản phẩm đang hoạt động. Tệp chưa được cập nhật.`, items: [] };
        }
        if (current.version !== item.version) {
          return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: sản phẩm đã thay đổi sau khi tải CSV. Hãy xuất lại danh sách rồi áp dụng thay đổi.`, items: [] };
        }
      }
      const requestedSkus = items.filter((item) => item.sku).map((item) => item.sku.toLocaleLowerCase('vi'));
      const requestedBarcodes = items.filter((item) => item.barcode).map((item) => item.barcode);
      const external = await client.query(
        `SELECT id, sku, sku_normalized, barcode FROM products
         WHERE store_id = $1 AND NOT (id = ANY($2::uuid[]))
           AND (sku_normalized = ANY($3::text[]) OR barcode = ANY($4::text[]))`,
        [storeId, productIds, requestedSkus, requestedBarcodes]
      );
      const conflictMessage = describeBulkUpdateConflict(items, [...selected.rows, ...external.rows]);
      if (conflictMessage) return { valid: false, count: items.length, conflict: conflictMessage, items: [] };

      const previewItems = items.map((item) => {
        const current = selectedById.get(item.productId);
        const before = {
          sku: current.sku,
          barcode: current.barcode,
          name: current.name,
          category: current.category,
          unit: current.unit,
          salePriceVnd: current.sale_price_vnd,
          costVnd: current.cost_vnd,
          lowStockThreshold: current.low_stock_threshold,
        };
        const next = {
          sku: item.sku ?? current.sku,
          barcode: item.clearBarcode ? null : (item.barcode ?? current.barcode),
          name: item.name ?? current.name,
          category: item.category ?? current.category,
          unit: item.unit ?? current.unit,
          salePriceVnd: item.salePriceVnd ?? Number(current.sale_price_vnd),
          costVnd: item.costVnd ?? Number(current.cost_vnd),
          lowStockThreshold: item.lowStockThreshold ?? current.low_stock_threshold,
        };
        const unchanged = current.sku === next.sku
          && (current.barcode ?? null) === (next.barcode ?? null)
          && current.name === next.name
          && current.category === next.category
          && current.unit === next.unit
          && String(current.sale_price_vnd) === String(next.salePriceVnd)
          && String(current.cost_vnd) === String(next.costVnd)
          && canonicalQuantityText(current.low_stock_threshold) === canonicalQuantityText(next.lowStockThreshold);
        return { ...item, before, unchanged };
      });
      return {
        valid: true,
        count: items.length,
        changedCount: previewItems.filter((item) => !item.unchanged).length,
        unchangedCount: previewItems.filter((item) => item.unchanged).length,
        conflict: null,
        items: previewItems,
      };
    });
  });

  app.post('/api/stores/:storeId/products/bulk-update', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const items = validateBulkUpdateRows(request.body?.items);
    const requestHash = createHash('sha256').update(JSON.stringify(items)).digest();
    const bulkUpdateId = randomUUID();
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, requestHash]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(requestHash)) throw new ApiError(409, 'idempotency_conflict', 'Mã cập nhật đã được dùng cho bộ dữ liệu khác.');
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Tệp đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const productIds = items.map((item) => item.productId);
      const locked = await client.query(
        `SELECT id, sku, sku_normalized, barcode, name, category, unit, sale_price_vnd::text AS sale_price_vnd,
                cost_vnd::text AS cost_vnd, low_stock_threshold::text AS low_stock_threshold,
                inventory_tracked, status, version
         FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [storeId, productIds]
      );
      const currentById = new Map(locked.rows.map((row) => [row.id, row]));
      for (const item of items) {
        const current = currentById.get(item.productId);
        if (!current || current.status !== 'active') throw new ApiError(409, 'product_not_found', `Dòng ${item.sourceLine}: không tìm thấy sản phẩm đang hoạt động. Không có dòng nào được cập nhật.`);
        if (current.version !== item.version) throw new ApiError(409, 'version_conflict', `Dòng ${item.sourceLine}: sản phẩm đã được thay đổi sau khi tải CSV. Không có dòng nào được cập nhật; hãy tải lại tệp rồi áp dụng thay đổi.`);
      }
      const requestedSkus = items.filter((item) => item.sku).map((item) => item.sku.toLocaleLowerCase('vi'));
      const requestedBarcodes = items.filter((item) => item.barcode).map((item) => item.barcode);
      const externalConflicts = await client.query(
        `SELECT id, sku_normalized, barcode FROM products
         WHERE store_id = $1 AND NOT (id = ANY($2::uuid[]))
           AND (sku_normalized = ANY($3::text[]) OR barcode = ANY($4::text[]))`,
        [storeId, productIds, requestedSkus, requestedBarcodes]
      );
      const conflictMessage = describeBulkUpdateConflict(items, [...locked.rows, ...externalConflicts.rows]);
      if (conflictMessage) throw new ApiError(409, 'product_conflict', conflictMessage);

      const nextById = new Map();
      const stagedRows = [];
      items.forEach((item, index) => {
        const old = currentById.get(item.productId);
        const next = {
          sku: item.sku ?? old.sku,
          barcode: item.clearBarcode ? null : (item.barcode ?? old.barcode),
          name: item.name ?? old.name,
          category: item.category ?? old.category,
          unit: item.unit ?? old.unit,
          salePriceVnd: item.salePriceVnd ?? Number(old.sale_price_vnd),
          costVnd: item.costVnd ?? Number(old.cost_vnd),
          lowStockThreshold: item.lowStockThreshold ?? old.low_stock_threshold,
        };
        nextById.set(item.productId, next);
        const changeSku = old.sku_normalized !== next.sku.toLocaleLowerCase('vi');
        const changeBarcode = (old.barcode ?? null) !== (next.barcode ?? null);
        if (changeSku || changeBarcode) {
          const temporarySku = `slink-tmp-${bulkUpdateId}-${index}`;
          stagedRows.push({ id: item.productId, temporarySku, temporarySkuNormalized: temporarySku.toLocaleLowerCase('vi'), changeSku, changeBarcode, version: item.version });
        }
      });
      if (stagedRows.length) {
        const staged = await client.query(
          `UPDATE products AS p
           SET sku = CASE WHEN stage.change_sku THEN stage.temporary_sku ELSE p.sku END,
               sku_normalized = CASE WHEN stage.change_sku THEN stage.temporary_sku_normalized ELSE p.sku_normalized END,
               barcode = CASE WHEN stage.change_barcode THEN NULL ELSE p.barcode END
           FROM unnest($2::uuid[], $3::text[], $4::text[], $5::boolean[], $6::boolean[], $7::integer[])
             AS stage(id, temporary_sku, temporary_sku_normalized, change_sku, change_barcode, version)
           WHERE p.store_id = $1 AND p.id = stage.id AND p.version = stage.version`,
          [storeId, stagedRows.map((row) => row.id), stagedRows.map((row) => row.temporarySku),
            stagedRows.map((row) => row.temporarySkuNormalized), stagedRows.map((row) => row.changeSku),
            stagedRows.map((row) => row.changeBarcode), stagedRows.map((row) => row.version)]
        );
        if (staged.rowCount !== stagedRows.length) throw new ApiError(409, 'version_conflict', 'Một sản phẩm vừa được thay đổi. Không có dòng nào được cập nhật; hãy tải CSV mới rồi thử lại.');
      }

      const updatedProducts = [];
      for (const item of items) {
        const old = currentById.get(item.productId);
        const next = nextById.get(item.productId);
        const changes = {};
        for (const [key, before, after] of [
          ['sku', old.sku, next.sku], ['barcode', old.barcode, next.barcode], ['name', old.name, next.name],
          ['category', old.category, next.category], ['unit', old.unit, next.unit],
          ['salePriceVnd', String(old.sale_price_vnd), String(next.salePriceVnd)],
          ['costVnd', String(old.cost_vnd), String(next.costVnd)],
          ['lowStockThreshold', String(old.low_stock_threshold), String(next.lowStockThreshold)],
        ]) {
          const previousValue = key === 'lowStockThreshold' ? canonicalQuantityText(before) : String(before ?? '');
          const nextValue = key === 'lowStockThreshold' ? canonicalQuantityText(after) : String(after ?? '');
          if (previousValue !== nextValue) changes[key] = { before: before ?? null, after };
        }
        if (Object.keys(changes).length === 0) {
          updatedProducts.push({ id: old.id, sku: old.sku, version: old.version, unchanged: true });
          continue;
        }
        const updated = await client.query(
          `UPDATE products SET sku = $3, sku_normalized = $4, barcode = $5, name = $6, category = $7, unit = $8,
               sale_price_vnd = $9, cost_vnd = $10, low_stock_threshold = $11,
               version = version + 1, updated_at = now()
           WHERE store_id = $1 AND id = $2 AND version = $12
           RETURNING id, sku, barcode, name, category, unit, sale_price_vnd::text AS sale_price_vnd,
                     cost_vnd::text AS cost_vnd, low_stock_threshold::text AS low_stock_threshold,
                     inventory_tracked, status, version, updated_at`,
          [storeId, item.productId, next.sku, next.sku.toLocaleLowerCase('vi'), next.barcode, next.name, next.category,
            next.unit, next.salePriceVnd, next.costVnd, next.lowStockThreshold, item.version]
        );
        if (!updated.rowCount) throw new ApiError(409, 'version_conflict', `Dòng ${item.sourceLine}: sản phẩm vừa được thay đổi. Không có dòng nào được cập nhật.`);
        if (next.costVnd !== Number(old.cost_vnd)) {
          await client.query(
            `INSERT INTO product_cost_history (store_id, product_id, unit_cost_vnd, source_type, actor_user_id)
             VALUES ($1, $2, $3, 'manual_adjustment', $4)`,
            [storeId, item.productId, next.costVnd, auth.userId]
          );
        }
        if (next.salePriceVnd !== Number(old.sale_price_vnd)) {
          await client.query(
            `INSERT INTO product_sale_price_history (store_id, product_id, previous_price_vnd, new_price_vnd, source_type, source_id, actor_user_id)
             VALUES ($1, $2, $3, $4, 'bulk_update', $5, $6)`,
            [storeId, item.productId, old.sale_price_vnd, next.salePriceVnd, bulkUpdateId, auth.userId]
          );
        }
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'product.bulk_updated', 'product', $3, $4::jsonb)`,
          [storeId, auth.userId, item.productId, JSON.stringify({ bulkUpdateId, sourceLine: item.sourceLine, changes })]
        );
        updatedProducts.push(updated.rows[0]);
      }
      const changedCount = updatedProducts.filter((product) => !product.unchanged).length;
      const unchangedCount = updatedProducts.length - changedCount;
      const body = { bulkUpdateId, count: updatedProducts.length, changedCount, unchangedCount, products: updatedProducts };
      await client.query(
        `UPDATE idempotency_records SET response_status = 200, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 200, body, replayed: false };
      });
    } catch (error) {
      return conflict(error);
    }
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/products', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const product = validateProduct(request.body);
    try {
      return await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const inserted = await client.query(
          `INSERT INTO products (
             store_id, sku, sku_normalized, barcode, name, category, unit,
             sale_price_vnd, cost_vnd, low_stock_threshold, inventory_tracked, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id, sku, barcode, name, category, unit, sale_price_vnd::text AS sale_price_vnd,
                     cost_vnd::text AS cost_vnd, low_stock_threshold::text AS low_stock_threshold,
                     inventory_tracked, status, version, created_at`,
          [storeId, product.sku, product.sku.toLocaleLowerCase('vi'), product.barcode, product.name,
            product.category, product.unit, product.salePriceVnd, product.costVnd,
            product.lowStockThreshold, product.inventoryTracked, auth.userId]
        );
        const created = inserted.rows[0];
        await client.query(
          `INSERT INTO product_sale_price_history (store_id, product_id, previous_price_vnd, new_price_vnd, source_type, actor_user_id)
           VALUES ($1, $2, NULL, $3, 'created', $4)`,
          [storeId, created.id, product.salePriceVnd, auth.userId]
        );
        await client.query(
          `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand)
           SELECT $1, w.id, $2, 0 FROM warehouses w WHERE w.store_id = $1 AND w.status = 'active'`,
          [storeId, created.id]
        );
        if (product.costVnd > 0) {
          await client.query(
            `INSERT INTO product_cost_history (store_id, product_id, unit_cost_vnd, source_type, actor_user_id)
             VALUES ($1, $2, $3, 'manual_adjustment', $4)`,
            [storeId, created.id, product.costVnd, auth.userId]
          );
        }
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'product.created', 'product', $3, jsonb_build_object('sku', $4::text))`,
          [storeId, auth.userId, created.id, created.sku]
        );
        return { product: { ...created, on_hand: '0', reserved: '0' } };
      });
    } catch (error) {
      return conflict(error);
    }
  });

  app.put('/api/stores/:storeId/products/:productId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    const expectedVersion = request.body?.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new ApiError(400, 'validation_error', 'Phiên bản sản phẩm không hợp lệ. Hãy tải lại danh sách.');
    const product = validateProduct(request.body, { partial: true });
    try {
      return await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const current = await client.query('SELECT * FROM products WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, productId]);
        if (!current.rowCount || current.rows[0].status === 'archived') throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang hoạt động.');
        if (current.rows[0].version !== expectedVersion) throw new ApiError(409, 'version_conflict', 'Sản phẩm đã được thay đổi trên thiết bị khác. Hãy tải lại rồi thử lại.');
        const old = current.rows[0];
        const next = {
          sku: product.sku ?? old.sku,
          barcode: product.barcode !== undefined ? product.barcode : old.barcode,
          name: product.name ?? old.name,
          category: product.category ?? old.category,
          unit: product.unit ?? old.unit,
          salePriceVnd: product.salePriceVnd ?? Number(old.sale_price_vnd),
          costVnd: product.costVnd ?? Number(old.cost_vnd),
          lowStockThreshold: product.lowStockThreshold ?? Number(old.low_stock_threshold),
          inventoryTracked: product.inventoryTracked ?? old.inventory_tracked,
        };
        if (old.inventory_tracked && !next.inventoryTracked) {
          const balance = await client.query(
            `SELECT on_hand > 0 AS has_on_hand, reserved > 0 AS has_reserved
             FROM inventory_balances WHERE store_id = $1 AND product_id = $2 ORDER BY warehouse_id FOR UPDATE`,
            [storeId, productId]
          );
          if (!balance.rowCount || balance.rows.some((row) => row.has_on_hand || row.has_reserved)) {
            throw new ApiError(409, 'inventory_tracking_change_requires_zero', 'Hãy điều chỉnh tồn thực tế và số lượng đang giữ về 0 trước khi tắt theo dõi tồn kho.');
          }
          const outstandingPurchaseOrder = await client.query(
            `SELECT 1 FROM purchase_order_lines l
             JOIN purchase_orders po ON po.store_id = l.store_id AND po.id = l.purchase_order_id
             WHERE l.store_id = $1 AND l.product_id = $2
               AND po.status IN ('draft', 'ordered', 'partially_received')
               AND l.quantity_received < l.quantity_ordered
             LIMIT 1`,
            [storeId, productId]
          );
          if (outstandingPurchaseOrder.rowCount) {
            throw new ApiError(409, 'inventory_tracking_change_requires_open_purchase_order', 'Hãy nhận đủ hoặc hủy các đơn đặt hàng còn mở trước khi tắt theo dõi tồn kho.');
          }
        }
        const updated = await client.query(
          `UPDATE products SET sku = $3, sku_normalized = $4, barcode = $5, name = $6, category = $7, unit = $8,
               sale_price_vnd = $9, cost_vnd = $10, low_stock_threshold = $11, inventory_tracked = $12,
               version = version + 1, updated_at = now()
           WHERE store_id = $1 AND id = $2 AND version = $13
           RETURNING id, sku, barcode, name, category, unit, sale_price_vnd::text AS sale_price_vnd,
                     cost_vnd::text AS cost_vnd, low_stock_threshold::text AS low_stock_threshold,
                     inventory_tracked, status, version, updated_at`,
          [storeId, productId, next.sku, next.sku.toLocaleLowerCase('vi'), next.barcode, next.name, next.category,
            next.unit, next.salePriceVnd, next.costVnd, next.lowStockThreshold, next.inventoryTracked, expectedVersion]
        );
        if (next.costVnd !== Number(old.cost_vnd)) {
          await client.query(
            `INSERT INTO product_cost_history (store_id, product_id, unit_cost_vnd, source_type, actor_user_id)
             VALUES ($1, $2, $3, 'manual_adjustment', $4)`,
            [storeId, productId, next.costVnd, auth.userId]
          );
        }
        if (next.salePriceVnd !== Number(old.sale_price_vnd)) {
          await client.query(
            `INSERT INTO product_sale_price_history (store_id, product_id, previous_price_vnd, new_price_vnd, source_type, actor_user_id)
             VALUES ($1, $2, $3, $4, 'manual_adjustment', $5)`,
            [storeId, productId, old.sale_price_vnd, next.salePriceVnd, auth.userId]
          );
        }
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'product.updated', 'product', $3, jsonb_build_object('version', $4::integer))`,
          [storeId, auth.userId, productId, updated.rows[0].version]
        );
        return { product: updated.rows[0] };
      });
    } catch (error) {
      return conflict(error);
    }
  });

  app.post('/api/stores/:storeId/products/:productId/archive', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    const result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const updated = await client.query(
        `UPDATE products SET status = 'archived', version = version + 1, updated_at = now()
         WHERE store_id = $1 AND id = $2 AND status = 'active' RETURNING id, sku, name, status, version`,
        [storeId, productId]
      );
      if (!updated.rowCount) throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang hoạt động.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'product.archived', 'product', $3)`,
        [storeId, auth.userId, productId]
      );
      return { product: updated.rows[0] };
    });
    reply.code(200);
    return result;
  });
}

module.exports = { registerProductRoutes, validateBulkUpdateRows, validateProduct };
