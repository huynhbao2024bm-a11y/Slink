'use strict';

const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { allowedWarehouseIds, canAccessWarehouse, findAccessibleWarehouse } = require('./warehouse-access');
const { generateUniqueEan13 } = require('../barcode-tools');
const { hasPermission, requirePermission } = require('./rbac');

function computeWarrantyStatus(row, nowMs = Date.now()) {
  if (!row || row.status === 'in_stock') return 'in_stock';
  if (row.status === 'archived') return 'archived';
  if (!row.warranty_expires_at) return 'none';
  const expiresMs = row.warranty_expires_at instanceof Date
    ? row.warranty_expires_at.getTime()
    : new Date(row.warranty_expires_at).getTime();
  if (!Number.isFinite(expiresMs)) return 'none';
  return expiresMs > nowMs ? 'active' : 'expired';
}

function normalizeSerialCode(raw) {
  const code = String(raw ?? '').trim();
  if (!code || code.length > 120 || /[\x00-\x1f\x7f]/.test(code)) return '';
  return code;
}

function normalizeSerialCodeList(input, { maxCount = 500 } = {}) {
  const rawList = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? input.split(/[\r\n,;|]+/)
      : [];
  const seen = new Set();
  const codes = [];
  for (const entry of rawList) {
    const trimmed = String(entry ?? '').trim();
    if (!trimmed) continue;
    const code = normalizeSerialCode(trimmed);
    if (!code) throw new ApiError(400, 'validation_error', `Mã “${trimmed.slice(0, 40)}” không hợp lệ (1–120 ký tự, không chứa ký tự điều khiển).`);
    const key = code.toLocaleLowerCase('vi');
    if (seen.has(key)) throw new ApiError(400, 'duplicate_serial_code', `Mã “${code}” bị trùng trong danh sách vừa nhập.`);
    seen.add(key);
    codes.push(code);
    if (codes.length > maxCount) throw new ApiError(400, 'validation_error', `Mỗi lần chỉ thêm tối đa ${maxCount} mã riêng.`);
  }
  return codes;
}

function generateSerialBatch(count, existingSet, prefix = '') {
  const cleanPrefix = String(prefix || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  const generated = [];
  if (!cleanPrefix) {
    for (let i = 0; i < count; i += 1) {
      generated.push(generateUniqueEan13(existingSet, '21'));
    }
    return generated;
  }
  for (let i = 0; i < count; i += 1) {
    let candidate = '';
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const token = randomBytes(4).toString('hex').toUpperCase();
      candidate = `${cleanPrefix}-${token}`;
      if (!existingSet.has(candidate) && !existingSet.has(candidate.toLocaleLowerCase('vi'))) break;
      candidate = '';
    }
    if (!candidate) throw new ApiError(500, 'serial_generation_failed', 'Không thể tạo mã duy nhất lúc này. Hãy thử lại.');
    existingSet.add(candidate);
    existingSet.add(candidate.toLocaleLowerCase('vi'));
    generated.push(candidate);
  }
  return generated;
}

function registerSerialRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/serials/lookup', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const code = normalizeSerialCode(request.query?.code);
    if (!code) throw new ApiError(400, 'validation_error', 'Thiếu mã cần tra cứu.');
    const requestedWarehouseId = request.query?.warehouseId;
    if (requestedWarehouseId !== undefined && requestedWarehouseId !== '' && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
      throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const canViewCost = hasPermission(membership, 'view_cost_price');
      const warehouseFilter = requestedWarehouseId || null;
      if (warehouseFilter && !await findAccessibleWarehouse(client, storeId, membership, warehouseFilter)) {
        throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      }
      const warehouseIds = allowedWarehouseIds(membership);

      const serialResult = await client.query(
        `SELECT sc.id, sc.code, sc.status, sc.product_id, sc.warehouse_id, sc.order_id,
                sc.sold_at, sc.warranty_expires_at,
                w.name AS warehouse_name, p.warranty_months,
                o.order_number, c.name AS customer_name, c.phone AS customer_phone
         FROM product_serial_codes sc
         JOIN warehouses w ON w.id = sc.warehouse_id AND w.store_id = sc.store_id
         JOIN products p ON p.id = sc.product_id AND p.store_id = sc.store_id
         LEFT JOIN orders o ON o.id = sc.order_id AND o.store_id = sc.store_id
         LEFT JOIN customers c ON c.id = o.customer_id AND c.store_id = o.store_id
         WHERE sc.store_id = $1 AND (sc.code = $2 OR lower(sc.code) = lower($2))
         ORDER BY (sc.code = $2) DESC, sc.created_at DESC
         LIMIT 1`,
        [storeId, code]
      );

      const fetchProduct = async (productId, fallbackCode) => {
        const res = await client.query(
          `SELECT p.id, p.sku, p.barcode, COALESCE(p.extra_barcodes, '{}'::text[]) AS extra_barcodes,
                  p.name, p.category, p.unit, p.sale_price_vnd::text AS sale_price_vnd,
                  CASE WHEN $4::boolean THEN p.cost_vnd::text ELSE NULL END AS cost_vnd,
                  p.low_stock_threshold::text AS low_stock_threshold, p.inventory_tracked,
                  p.serial_tracked, p.warranty_months, p.variant_group_id, p.variant_group_name, p.variant_attributes,
                  p.image_version, p.image_content_type,
                  CASE WHEN $4::boolean THEN p.purchase_pack ELSE NULL END AS purchase_pack,
                  p.status, p.version,
                  COALESCE(i.on_hand, 0)::text AS on_hand,
                  COALESCE(i.reserved, 0)::text AS reserved,
                  COALESCE(i.version, 1)::int AS inventory_version
           FROM products p
           LEFT JOIN LATERAL (
             SELECT SUM(b.on_hand) FILTER (WHERE ($5::uuid IS NULL OR b.warehouse_id = $5) AND ($6::uuid[] IS NULL OR b.warehouse_id = ANY($6))) AS on_hand,
                    SUM(b.reserved) FILTER (WHERE ($5::uuid IS NULL OR b.warehouse_id = $5) AND ($6::uuid[] IS NULL OR b.warehouse_id = ANY($6))) AS reserved,
                    MAX(b.version) FILTER (WHERE ($5::uuid IS NULL OR b.warehouse_id = $5) AND ($6::uuid[] IS NULL OR b.warehouse_id = ANY($6))) AS version
             FROM inventory_balances b WHERE b.store_id = p.store_id AND b.product_id = p.id
           ) i ON true
           WHERE p.store_id = $1 AND p.status = 'active'
             AND (($2::uuid IS NOT NULL AND p.id = $2)
               OR ($2::uuid IS NULL AND (p.barcode = $3 OR $3 = ANY(p.extra_barcodes) OR p.sku_normalized = lower($3))))
           LIMIT 1`,
          [storeId, productId || null, fallbackCode || '', canViewCost, warehouseFilter, warehouseIds]
        );
        return res.rows[0] || null;
      };

      if (serialResult.rowCount) {
        const row = serialResult.rows[0];
        if (!canAccessWarehouse(membership, row.warehouse_id)) {
          return { matchType: 'none', serial: null, product: null };
        }
        const product = await fetchProduct(row.product_id, null);
        return {
          matchType: 'serial',
          serial: {
            id: row.id,
            code: row.code,
            status: row.status,
            productId: row.product_id,
            warehouseId: row.warehouse_id,
            warehouseName: row.warehouse_name,
            orderId: row.order_id,
            orderNumber: row.order_number || null,
            soldAt: row.sold_at || null,
            warrantyMonths: Number(row.warranty_months || 0),
            warrantyExpiresAt: row.warranty_expires_at || null,
            warrantyStatus: computeWarrantyStatus(row),
            customerName: row.customer_name || null,
            customerPhone: row.customer_phone || null,
          },
          product,
        };
      }

      const product = await fetchProduct(null, code);
      if (product) return { matchType: 'product', serial: null, product };
      return { matchType: 'none', serial: null, product: null };
    });
  });

  app.get('/api/stores/:storeId/products/:productId/serials', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    }
    const status = ['in_stock', 'sold', 'archived', 'all'].includes(request.query?.status) ? request.query.status : 'all';
    const search = typeof request.query?.q === 'string' ? request.query.q.trim().slice(0, 120) : '';
    const limit = Math.min(Math.max(Number.parseInt(request.query?.limit || '100', 10) || 100, 1), 300);
    const requestedWarehouseId = request.query?.warehouseId;
    if (requestedWarehouseId !== undefined && requestedWarehouseId !== '' && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
      throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const warehouseFilter = requestedWarehouseId || null;
      if (warehouseFilter && !await findAccessibleWarehouse(client, storeId, membership, warehouseFilter)) {
        throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      }
      const warehouseIds = allowedWarehouseIds(membership);
      const productRes = await client.query(
        `SELECT id, name, sku, unit, serial_tracked, inventory_tracked, warranty_months, status
         FROM products WHERE store_id = $1 AND id = $2`,
        [storeId, productId]
      );
      if (!productRes.rowCount) throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm.');

      const countsRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'in_stock')::int AS in_stock,
           COUNT(*) FILTER (WHERE status = 'sold')::int AS sold
         FROM product_serial_codes
         WHERE store_id = $1 AND product_id = $2
           AND ($3::uuid IS NULL OR warehouse_id = $3)
           AND ($4::uuid[] IS NULL OR warehouse_id = ANY($4))`,
        [storeId, productId, warehouseFilter, warehouseIds]
      );

      const rowsRes = await client.query(
        `SELECT sc.id, sc.code, sc.status, sc.warehouse_id, w.name AS warehouse_name,
                sc.order_id, o.order_number, sc.sold_at, sc.warranty_expires_at, sc.created_at,
                c.name AS customer_name, c.phone AS customer_phone
         FROM product_serial_codes sc
         JOIN warehouses w ON w.id = sc.warehouse_id AND w.store_id = sc.store_id
         LEFT JOIN orders o ON o.id = sc.order_id AND o.store_id = sc.store_id
         LEFT JOIN customers c ON c.id = o.customer_id AND c.store_id = o.store_id
         WHERE sc.store_id = $1 AND sc.product_id = $2
           AND ($3::text = 'all' OR sc.status = $3)
           AND ($4::uuid IS NULL OR sc.warehouse_id = $4)
           AND ($5::uuid[] IS NULL OR sc.warehouse_id = ANY($5))
           AND ($6 = '' OR sc.code ILIKE '%' || $6 || '%')
         ORDER BY (sc.status = 'in_stock') DESC, sc.created_at DESC, sc.id DESC
         LIMIT $7`,
        [storeId, productId, status, warehouseFilter, warehouseIds, search, limit]
      );

      const warrantyMonths = Number(productRes.rows[0].warranty_months || 0);
      return {
        product: productRes.rows[0],
        counts: {
          inStock: Number(countsRes.rows[0]?.in_stock || 0),
          sold: Number(countsRes.rows[0]?.sold || 0),
        },
        serials: rowsRes.rows.map((row) => {
          const warrantyStatus = computeWarrantyStatus(row);
          return {
            ...row,
            warranty_months: warrantyMonths,
            warranty_status: warrantyStatus,
            warrantyMonths,
            warrantyExpiresAt: row.warranty_expires_at || null,
            warrantyStatus,
            customerName: row.customer_name || null,
            customerPhone: row.customer_phone || null,
            orderNumber: row.order_number || null,
            soldAt: row.sold_at || null,
          };
        }),
      };
    });
  });

  app.post('/api/stores/:storeId/products/:productId/serials', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    }
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã chống gửi trùng an toàn. Hãy thử lại.');
    }
    const body = request.body || {};
    const requestedWarehouseId = body.warehouseId || null;
    if (requestedWarehouseId !== null && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
      throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    }
    const explicitCodes = body.codes !== undefined ? normalizeSerialCodeList(body.codes, { maxCount: 500 }) : [];
    const autoGenerateCount = body.autoGenerateCount === undefined || body.autoGenerateCount === null || body.autoGenerateCount === ''
      ? 0
      : Number(body.autoGenerateCount);
    if (!Number.isSafeInteger(autoGenerateCount) || autoGenerateCount < 0 || autoGenerateCount > 200) {
      throw new ApiError(400, 'validation_error', 'Số lượng mã tự tạo phải từ 0 đến 200.');
    }
    if (explicitCodes.length + autoGenerateCount < 1 || explicitCodes.length + autoGenerateCount > 500) {
      throw new ApiError(400, 'validation_error', 'Cần nhập/quét ít nhất 1 mã hoặc chọn số lượng tự tạo (tối đa 500 mã).');
    }
    const prefix = typeof body.prefix === 'string' ? body.prefix.trim().slice(0, 20) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 240) : '';
    const canonicalHash = idempotencyKey
      ? createHash('sha256').update(JSON.stringify({ op: 'serials.add', productId, requestedWarehouseId, explicitCodes, autoGenerateCount, prefix, note })).digest()
      : null;

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'edit_products', 'Tài khoản này không có quyền thêm mã sản phẩm.');
      if (idempotencyKey) {
        const reserved = await client.query(
          `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
          [storeId, auth.userId, idempotencyKey, canonicalHash]
        );
        if (!reserved.rowCount) {
          const prev = await client.query(
            `SELECT request_hash, response_status, response_body FROM idempotency_records
             WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
            [storeId, auth.userId, idempotencyKey]
          );
          const rec = prev.rows[0];
          if (!rec || !Buffer.from(rec.request_hash).equals(canonicalHash)) {
            throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã dùng cho dữ liệu khác.');
          }
          if (!rec.response_body || !rec.response_status) {
            throw new ApiError(409, 'request_in_progress', 'Yêu cầu đang được xử lý. Hãy thử lại sau.');
          }
          return { status: rec.response_status, body: rec.response_body, replayed: true };
        }
      }

      const productRes = await client.query(
        `SELECT id, name, sku, unit, inventory_tracked, serial_tracked, status
         FROM products WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, productId]
      );
      if (!productRes.rowCount || productRes.rows[0].status !== 'active') {
        throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang hoạt động.');
      }
      const product = productRes.rows[0];
      if (!product.inventory_tracked) {
        throw new ApiError(400, 'validation_error', 'Bật theo dõi tồn kho trước khi quản lý từng mã sản phẩm.');
      }

      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId, { lock: true });
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');

      let finalCodes = [...explicitCodes];
      if (autoGenerateCount > 0) {
        const existingCodesRes = await client.query(
          `SELECT code FROM product_serial_codes WHERE store_id = $1
           UNION ALL
           SELECT barcode AS code FROM products WHERE store_id = $1 AND barcode IS NOT NULL
           UNION ALL
           SELECT unnest(extra_barcodes) AS code FROM products WHERE store_id = $1 AND extra_barcodes IS NOT NULL
           UNION ALL
           SELECT sku AS code FROM products WHERE store_id = $1`,
          [storeId]
        );
        const used = new Set();
        existingCodesRes.rows.forEach((r) => {
          if (r.code) { used.add(r.code); used.add(String(r.code).toLocaleLowerCase('vi')); }
        });
        finalCodes.forEach((c) => { used.add(c); used.add(c.toLocaleLowerCase('vi')); });
        finalCodes = finalCodes.concat(generateSerialBatch(autoGenerateCount, used, prefix));
      }

      const lowerCodes = finalCodes.map((c) => c.toLocaleLowerCase('vi'));
      const dupes = await client.query(
        `SELECT code, status FROM product_serial_codes
         WHERE store_id = $1 AND lower(code) = ANY($2::text[]) LIMIT 1`,
        [storeId, lowerCodes]
      );
      if (dupes.rowCount) {
        const d = dupes.rows[0];
        throw new ApiError(409, 'serial_code_exists', `Mã “${d.code}” đã tồn tại trong cửa hàng (${d.status === 'sold' ? 'đã bán' : 'đang trong kho'}).`);
      }
      const prodCollision = await client.query(
        `SELECT name, sku, barcode FROM products
         WHERE store_id = $1 AND status = 'active'
           AND (lower(COALESCE(barcode, '')) = ANY($2::text[])
                OR sku_normalized = ANY($2::text[])
                OR EXISTS (SELECT 1 FROM unnest(COALESCE(extra_barcodes, '{}'::text[])) eb WHERE lower(eb) = ANY($2::text[])))
         LIMIT 1`,
        [storeId, lowerCodes]
      );
      if (prodCollision.rowCount) {
        throw new ApiError(409, 'serial_code_exists', `Có mã riêng trùng với mã vạch/SKU của sản phẩm “${prodCollision.rows[0].name}”.`);
      }

      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO product_serial_codes (store_id, product_id, warehouse_id, code, status, created_by)
           SELECT $1, $2, $3, c, 'in_stock', $4 FROM unnest($5::text[]) AS c
           RETURNING id, code, status, warehouse_id, created_at`,
          [storeId, productId, warehouse.id, auth.userId, finalCodes]
        );
      } catch (err) {
        if (err && err.code === '23505') {
          throw new ApiError(409, 'serial_code_exists', 'Có mã riêng vừa được tạo ở thao tác khác và bị trùng trong cửa hàng. Hãy tải lại và thử lại.');
        }
        throw err;
      }

      if (!product.serial_tracked) {
        await client.query(
          `UPDATE products SET serial_tracked = true, version = version + 1, updated_at = now()
           WHERE store_id = $1 AND id = $2`,
          [storeId, productId]
        );
      }

      const updatedBalance = await client.query(
        `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
         VALUES ($1, $2, $3, $4::numeric, 0)
         ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
           SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
               version = inventory_balances.version + 1, updated_at = now()
         RETURNING on_hand::text AS on_hand`,
        [storeId, warehouse.id, productId, String(finalCodes.length)]
      );

      const reason = `Thêm ${finalCodes.length} mã riêng${note ? ': ' + note : ''}`;
      await client.query(
        `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                           reason, source_type, source_id, actor_user_id)
         VALUES ($1, $2, $3, 'adjustment', $4::numeric, $5::numeric, $6, 'serial_addition', $3, $7)`,
        [storeId, warehouse.id, productId, String(finalCodes.length), updatedBalance.rows[0].on_hand, reason, auth.userId]
      );

      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'product.serials_added', 'product', $3, $4,
                 jsonb_build_object('addedCount', $5::int, 'warehouseId', $6::text, 'warehouseName', $7::text))`,
        [storeId, auth.userId, productId, reason, finalCodes.length, warehouse.id, warehouse.name]
      );

      const resBody = {
        productId,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        addedCount: inserted.rowCount,
        newOnHand: updatedBalance.rows[0].on_hand,
        serials: inserted.rows,
      };
      if (idempotencyKey) {
        await client.query(
          `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
          [storeId, auth.userId, idempotencyKey, JSON.stringify(resBody)]
        );
      }
      return { status: 201, body: resBody, replayed: false };
    });

    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/serials/transfer', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    }
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã chống gửi trùng an toàn. Hãy thử lại.');
    }
    const body = request.body || {};
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const sourceWarehouseId = typeof body.sourceWarehouseId === 'string' ? body.sourceWarehouseId.trim() : '';
    const destinationWarehouseId = typeof body.destinationWarehouseId === 'string' ? body.destinationWarehouseId.trim() : '';
    if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(sourceWarehouseId) || !UUID_PATTERN.test(destinationWarehouseId)) {
      throw new ApiError(400, 'validation_error', 'Sản phẩm hoặc kho chuyển/nhận không hợp lệ.');
    }
    if (sourceWarehouseId.toLowerCase() === destinationWarehouseId.toLowerCase()) {
      throw new ApiError(400, 'validation_error', 'Kho nhận phải khác kho xuất.');
    }
    const codes = normalizeSerialCodeList(body.codes, { maxCount: 200 });
    if (codes.length < 1) {
      throw new ApiError(400, 'validation_error', 'Chọn ít nhất 1 mã riêng cần chuyển kho.');
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 240) : '';
    const canonicalHash = createHash('sha256').update(JSON.stringify({
      op: 'serials.transfer',
      productId: productId.toLowerCase(),
      sourceWarehouseId: sourceWarehouseId.toLowerCase(),
      destinationWarehouseId: destinationWarehouseId.toLowerCase(),
      codes,
      note,
    })).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'edit_products', 'Tài khoản này không có quyền chuyển kho mã riêng.');
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, canonicalHash]
      );
      if (!reserved.rowCount) {
        const prev = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const rec = prev.rows[0];
        if (!rec || !Buffer.from(rec.request_hash).equals(canonicalHash)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã dùng cho dữ liệu khác.');
        }
        if (!rec.response_body || !rec.response_status) {
          throw new ApiError(409, 'request_in_progress', 'Yêu cầu đang được xử lý. Hãy thử lại sau.');
        }
        return { status: rec.response_status, body: rec.response_body, replayed: true };
      }

      // Lock in canonical order matching sales.js (warehouses -> products -> inventory_balances -> product_serial_codes) to prevent deadlocks
      const orderedWhIds = [sourceWarehouseId, destinationWarehouseId].sort();
      const whRes = await client.query(
        `SELECT id, name, status FROM warehouses
         WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [storeId, orderedWhIds]
      );
      const whMap = new Map(whRes.rows.map((w) => [w.id.toLowerCase(), w]));
      const srcWh = whMap.get(sourceWarehouseId.toLowerCase());
      const dstWh = whMap.get(destinationWarehouseId.toLowerCase());
      if (!srcWh || srcWh.status !== 'active' || !canAccessWarehouse(membership, srcWh.id)) {
        throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho xuất đang hoạt động.');
      }
      if (!dstWh || dstWh.status !== 'active' || !canAccessWarehouse(membership, dstWh.id)) {
        throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận đang hoạt động.');
      }

      const productRes = await client.query(
        `SELECT id, name, sku, unit, inventory_tracked, serial_tracked, status
         FROM products WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, productId]
      );
      if (!productRes.rowCount || productRes.rows[0].status !== 'active') {
        throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang hoạt động.');
      }
      if (!productRes.rows[0].inventory_tracked) {
        throw new ApiError(400, 'validation_error', 'Sản phẩm chưa bật theo dõi tồn kho.');
      }

      const qtyText = String(codes.length);
      const srcBalRes = await client.query(
        `SELECT on_hand::text AS on_hand, reserved::text AS reserved FROM inventory_balances
         WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
        [storeId, srcWh.id, productId]
      );
      const currentSrcOnHand = Number(srcBalRes.rows[0]?.on_hand || 0);
      const currentSrcReserved = Number(srcBalRes.rows[0]?.reserved || 0);
      const availableSrc = currentSrcOnHand - currentSrcReserved;
      if (!srcBalRes.rowCount || availableSrc < codes.length) {
        throw new ApiError(409, 'insufficient_stock', `Kho “${srcWh.name}” không đủ tồn khả dụng để chuyển ${codes.length} mã riêng.`);
      }

      const lowerCodes = codes.map((c) => c.toLocaleLowerCase('vi'));
      const matched = await client.query(
        `SELECT id, code FROM product_serial_codes
         WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $3 AND status = 'in_stock'
           AND lower(code) = ANY($4::text[])
         ORDER BY id FOR UPDATE`,
        [storeId, productId, srcWh.id, lowerCodes]
      );
      if (matched.rowCount !== codes.length) {
        throw new ApiError(409, 'serial_transfer_invalid', 'Có mã riêng không còn trong kho xuất hoặc không thuộc sản phẩm này.');
      }

      const serialIds = matched.rows.map((r) => r.id);
      await client.query(
        `UPDATE product_serial_codes
         SET warehouse_id = $2, updated_at = now()
         WHERE store_id = $1 AND id = ANY($3::uuid[])`,
        [storeId, dstWh.id, serialIds]
      );

      const newSrcBal = await client.query(
        `UPDATE inventory_balances
         SET on_hand = on_hand - $4::numeric, version = version + 1, updated_at = now()
         WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3
         RETURNING on_hand::text AS on_hand`,
        [storeId, srcWh.id, productId, qtyText]
      );
      const newDstBal = await client.query(
        `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
         VALUES ($1, $2, $3, $4::numeric, 0)
         ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
           SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
               version = inventory_balances.version + 1, updated_at = now()
         RETURNING on_hand::text AS on_hand`,
        [storeId, dstWh.id, productId, qtyText]
      );

      const transferId = randomUUID();
      const outReason = `Chuyển ${codes.length} mã riêng sang ${dstWh.name}${note ? ': ' + note : ''}`;
      const inReason = `Nhận ${codes.length} mã riêng từ ${srcWh.name}${note ? ': ' + note : ''}`;
      await client.query(
        `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                           reason, source_type, source_id, actor_user_id)
         VALUES ($1, $2, $3, 'transfer_out', $4::numeric, $5::numeric, $6, 'serial_transfer', $7, $8)`,
        [storeId, srcWh.id, productId, `-${qtyText}`, newSrcBal.rows[0].on_hand, outReason, transferId, auth.userId]
      );
      await client.query(
        `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                           reason, source_type, source_id, actor_user_id)
         VALUES ($1, $2, $3, 'transfer_in', $4::numeric, $5::numeric, $6, 'serial_transfer', $7, $8)`,
        [storeId, dstWh.id, productId, qtyText, newDstBal.rows[0].on_hand, inReason, transferId, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'product.serials_transferred', 'product', $3, $4,
                 jsonb_build_object('transferId', $5::text, 'count', $6::int, 'sourceWarehouseId', $7::text, 'destinationWarehouseId', $8::text, 'codes', $9::jsonb))`,
        [storeId, auth.userId, productId, outReason, transferId, codes.length, srcWh.id, dstWh.id, JSON.stringify(matched.rows.map((r) => r.code).slice(0, 50))]
      );

      const resBody = {
        transferId,
        productId,
        sourceWarehouseId: srcWh.id,
        sourceWarehouseName: srcWh.name,
        destinationWarehouseId: dstWh.id,
        destinationWarehouseName: dstWh.name,
        transferredCount: matched.rowCount,
        transferredCodes: matched.rows.map((r) => r.code),
        sourceOnHand: newSrcBal.rows[0].on_hand,
        destinationOnHand: newDstBal.rows[0].on_hand,
      };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(resBody)]
      );
      return { status: 201, body: resBody, replayed: false };
    });

    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerSerialRoutes, normalizeSerialCode, normalizeSerialCodeList, generateSerialBatch, computeWarrantyStatus };
