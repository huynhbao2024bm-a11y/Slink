'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { findAccessibleWarehouse } = require('./warehouse-access');

const STOCK_ROLES = new Set(['owner', 'manager', 'stockkeeper']);

function quantityMilli(value, label) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(text));
  if (!match) throw new ApiError(400, 'validation_error', `${label} phải không âm và có tối đa 3 chữ số thập phân.`);
  const fraction = (match[2] || '').padEnd(3, '0');
  return BigInt(match[1]) * 1000n + BigInt(fraction || '0');
}

function quantityText(milli) {
  const whole = milli / 1000n;
  const fraction = milli % 1000n;
  return fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
}

function signedQuantityText(milli) {
  return `${milli < 0n ? '-' : ''}${quantityText(milli < 0n ? -milli : milli)}`;
}

function validateBulkCountItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 200) {
    throw new ApiError(400, 'validation_error', 'Mỗi lần kiểm kê cần từ 1 đến 200 dòng.');
  }
  const seen = new Set();
  return rawItems.map((raw, index) => {
    const sourceLine = raw?.sourceLine;
    if (typeof raw?.productId !== 'string' || !UUID_PATTERN.test(raw.productId)) {
      throw new ApiError(400, 'validation_error', `Dòng ${index + 2}: mã sản phẩm không hợp lệ.`);
    }
    const productId = raw.productId.toLowerCase();
    if (!Number.isSafeInteger(raw.expectedInventoryVersion) || raw.expectedInventoryVersion < 1) {
      throw new ApiError(400, 'validation_error', `Dòng ${index + 2}: phiên bản tồn kho không hợp lệ.`);
    }
    if (!Number.isSafeInteger(sourceLine) || sourceLine < 2 || sourceLine > 1_000_000) {
      throw new ApiError(400, 'validation_error', `Dòng ${index + 2}: số dòng CSV không hợp lệ.`);
    }
    if (seen.has(productId)) throw new ApiError(400, 'validation_error', `Dòng ${sourceLine}: mã sản phẩm bị lặp.`);
    seen.add(productId);
    const countMilli = quantityMilli(raw.count, `Dòng ${sourceLine}, số lượng đếm`);
    return {
      productId,
      expectedInventoryVersion: raw.expectedInventoryVersion,
      count: quantityText(countMilli),
      countMilli,
      sourceLine,
    };
  });
}

function registerStockRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/inventory', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const requestedLimit = Number(request.query?.limit || 100);
    const requestedOffset = Number(request.query?.offset || 0);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 100;
    const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 1_000_000)) : 0;
    const search = typeof request.query?.q === 'string' ? request.query.q.trim().slice(0, 100) : '';
    const requestedWarehouseId = request.query?.warehouseId;
    if (requestedWarehouseId !== undefined && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
      throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const canViewCost = ['owner', 'manager', 'stockkeeper', 'accountant'].includes(membership.role);
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId || null);
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      const summaryResult = await client.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE COALESCE(b.on_hand, 0) <= p.low_stock_threshold)::int AS low_count,
                COUNT(*) FILTER (WHERE COALESCE(b.on_hand, 0) = 0)::int AS out_count,
                CASE WHEN $2::boolean THEN COALESCE(SUM(p.cost_vnd * b.on_hand), 0)::text ELSE NULL END AS stock_value_vnd
         FROM products p LEFT JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $3
         WHERE p.store_id = $1 AND p.status = 'active' AND p.inventory_tracked = true`,
        [storeId, canViewCost, warehouse.id]
      );
      const rows = await client.query(
        `SELECT p.id, p.sku, p.barcode, p.name, p.category, p.unit,
                p.sale_price_vnd::text AS sale_price_vnd,
                CASE WHEN $5::boolean THEN p.cost_vnd::text ELSE NULL END AS cost_vnd,
                p.low_stock_threshold::text AS low_stock_threshold, p.inventory_tracked, p.status, p.version,
                COALESCE(b.on_hand, 0)::text AS on_hand, COALESCE(b.reserved, 0)::text AS reserved, COALESCE(b.version, 1) AS inventory_version,
                latest.movement_type AS latest_movement_type,
                latest.quantity_delta::text AS latest_quantity_delta,
                latest.reason AS latest_reason,
                latest.occurred_at AS latest_occurred_at,
                COUNT(*) OVER()::int AS total_count
         FROM products p LEFT JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $6
         LEFT JOIN LATERAL (
           SELECT movement_type, quantity_delta, reason, occurred_at FROM inventory_movements m
           WHERE m.store_id = p.store_id AND m.product_id = p.id AND m.warehouse_id = $6
           ORDER BY occurred_at DESC, id DESC LIMIT 1
         ) latest ON true
         WHERE p.store_id = $1 AND p.status = 'active' AND p.inventory_tracked = true
           AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.sku ILIKE '%' || $2 || '%' OR p.category ILIKE '%' || $2 || '%')
         ORDER BY p.name, p.id LIMIT $3 OFFSET $4`,
        [storeId, search, limit + 1, offset, canViewCost, warehouse.id]
      );
      const hasMore = rows.rows.length > limit;
      return {
        products: rows.rows.slice(0, limit),
        total: Number(rows.rows[0]?.total_count || 0),
        nextOffset: hasMore ? offset + limit : null,
        summary: {
          total: Number(summaryResult.rows[0].total),
          low: Number(summaryResult.rows[0].low_count),
          out: Number(summaryResult.rows[0].out_count),
          stockValueVnd: summaryResult.rows[0].stock_value_vnd,
        },
        warehouse: { id: warehouse.id, name: warehouse.name, isDefault: warehouse.is_default },
        movements: rows.rows.slice(0, limit).filter((row) => row.latest_movement_type).map((row) => ({
          productId: row.id,
          type: row.latest_movement_type,
          delta: row.latest_quantity_delta,
          reason: row.latest_reason,
          createdAt: row.latest_occurred_at,
        })),
      };
    });
  });

  app.post('/api/stores/:storeId/stock-adjustments/bulk/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const items = validateBulkCountItems(request.body?.items);
    const productIds = items.map((item) => item.productId);
    const requestedWarehouseId = request.body?.warehouseId;
    if (requestedWarehouseId !== undefined && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền kiểm kê tồn kho.');
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId || null);
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      const warehouseId = warehouse.id;
      const selected = await client.query(
        `SELECT p.id, p.sku, p.name, p.unit, p.status, p.inventory_tracked,
                b.on_hand::text AS on_hand, b.reserved::text AS reserved, b.version AS inventory_version
         FROM products p JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $3
         WHERE p.store_id = $1 AND p.id = ANY($2::uuid[]) ORDER BY p.id`,
        [storeId, productIds, warehouseId]
      );
      const byId = new Map(selected.rows.map((row) => [row.id, row]));
      const previewItems = [];
      for (const item of items) {
        const row = byId.get(item.productId);
        if (!row || row.status !== 'active') return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: không tìm thấy sản phẩm đang hoạt động. Chưa có thay đổi nào được lưu.` };
        if (!row.inventory_tracked) return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: sản phẩm không theo dõi tồn kho nên không thể kiểm kê.` };
        if (Number(row.inventory_version) !== item.expectedInventoryVersion) return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: tồn kho đã thay đổi sau khi xuất tệp. Hãy xuất lại danh sách trước khi kiểm kê.` };
        const onHandMilli = quantityMilli(row.on_hand, 'Tồn kho hiện tại');
        const reservedMilli = quantityMilli(row.reserved, 'Số lượng đang giữ');
        if (item.countMilli < reservedMilli) return { valid: false, count: items.length, conflict: `Dòng ${item.sourceLine}: số đếm thấp hơn lượng đang giữ cho đơn hàng.` };
        previewItems.push({
          productId: row.id,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          onHand: row.on_hand,
          reserved: row.reserved,
          counted: item.count,
          delta: signedQuantityText(item.countMilli - onHandMilli),
          inventoryVersion: Number(row.inventory_version),
          sourceLine: item.sourceLine,
          unchanged: item.countMilli === onHandMilli,
        });
      }
      return {
        valid: true,
        warehouseId,
        count: previewItems.length,
        changedCount: previewItems.filter((item) => !item.unchanged).length,
        unchangedCount: previewItems.filter((item) => item.unchanged).length,
        items: previewItems,
      };
    });
  });

  app.post('/api/stores/:storeId/stock-adjustments/bulk', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const items = validateBulkCountItems(request.body?.items);
    const warehouseInput = request.body?.warehouseId;
    if (warehouseInput !== undefined && (typeof warehouseInput !== 'string' || !UUID_PATTERN.test(warehouseInput))) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    const requestedWarehouseId = warehouseInput?.toLowerCase() || null;
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : 'Kiểm kê hàng loạt';
    if (!reason || reason.length > 500) throw new ApiError(400, 'validation_error', 'Lý do kiểm kê cần từ 1 đến 500 ký tự.');
    const canonical = {
      items: items.map(({ countMilli, ...item }) => item), reason,
    };
    if (requestedWarehouseId) canonical.warehouseId = requestedWarehouseId;
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const batchId = randomUUID();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền kiểm kê tồn kho.');
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId || null, { lock: true });
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      const warehouseId = warehouse.id;
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, digest]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu thao tác đã được dùng cho dữ liệu khác.');
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Lần kiểm kê đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const productIds = items.map((item) => item.productId);
      const locked = await client.query(
        `SELECT p.id, p.name, p.status, p.inventory_tracked,
                b.on_hand::text AS on_hand, b.reserved::text AS reserved, b.version AS inventory_version
         FROM products p JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $3
         WHERE p.store_id = $1 AND p.id = ANY($2::uuid[]) ORDER BY p.id FOR UPDATE OF p, b`,
        [storeId, productIds, warehouseId]
      );
      const byId = new Map(locked.rows.map((row) => [row.id, row]));
      const changes = [];
      for (const item of items) {
        const row = byId.get(item.productId);
        if (!row || row.status !== 'active') throw new ApiError(404, 'product_not_found', `Dòng ${item.sourceLine}: không tìm thấy sản phẩm đang hoạt động. Toàn bộ lô đã bị hủy.`);
        if (!row.inventory_tracked) throw new ApiError(409, 'inventory_not_tracked', `Dòng ${item.sourceLine}: sản phẩm không theo dõi tồn kho. Toàn bộ lô đã bị hủy.`);
        if (Number(row.inventory_version) !== item.expectedInventoryVersion) throw new ApiError(409, 'inventory_version_conflict', `Dòng ${item.sourceLine}: tồn kho vừa thay đổi. Xuất lại danh sách rồi gửi lô mới; không dòng nào được ghi.`);
        const previousMilli = quantityMilli(row.on_hand, 'Tồn kho hiện tại');
        const reservedMilli = quantityMilli(row.reserved, 'Số lượng đang giữ');
        if (item.countMilli < reservedMilli) throw new ApiError(409, 'reserved_stock', `Dòng ${item.sourceLine}: số đếm thấp hơn lượng đang giữ cho đơn hàng. Không dòng nào được ghi.`);
        changes.push({ item, row, previousMilli, deltaMilli: item.countMilli - previousMilli });
      }

      const changed = [];
      const unchanged = [];
      for (const change of changes) {
        const { item, row, previousMilli, deltaMilli } = change;
        if (deltaMilli === 0n) {
          unchanged.push({ productId: item.productId, name: row.name, onHand: item.count });
          continue;
        }
        const updated = await client.query(
          `UPDATE inventory_balances SET on_hand = $3::numeric, version = version + 1, updated_at = now()
           WHERE store_id = $1 AND product_id = $2 AND version = $4
             AND warehouse_id = $5 RETURNING version`,
          [storeId, item.productId, item.count, item.expectedInventoryVersion, warehouseId]
        );
        if (!updated.rowCount) throw new ApiError(409, 'inventory_version_conflict', `Dòng ${item.sourceLine}: tồn kho vừa thay đổi. Không dòng nào được ghi.`);
        const delta = signedQuantityText(deltaMilli);
        await client.query(
          `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                             reason, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'count', $4::numeric, $5::numeric, $6, 'bulk_stock_count', $7, $8)`,
          [storeId, warehouseId, item.productId, delta, item.count, reason, batchId, auth.userId]
        );
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, 'inventory.bulk_counted', 'product', $3, $4,
                   jsonb_build_object('batchId', $5::text, 'sourceLine', $6::integer,
                                      'previous', $7::text, 'counted', $8::text, 'delta', $9::text))`,
          [storeId, auth.userId, item.productId, reason, batchId, item.sourceLine,
            quantityText(previousMilli), item.count, delta]
        );
        changed.push({ productId: item.productId, name: row.name, onHand: item.count, delta, version: Number(updated.rows[0].version) });
      }
      if (changed.length) {
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, 'inventory.bulk_count_completed', 'inventory_bulk_count', $3, $4,
                   jsonb_build_object('count', $5::integer, 'changedCount', $6::integer, 'unchangedCount', $7::integer))`,
          [storeId, auth.userId, batchId, reason, items.length, changed.length, unchanged.length]
        );
      }
      const body = { batchId, count: items.length, changedCount: changed.length, unchangedCount: unchanged.length, changed, unchanged };
      await client.query(
        `UPDATE idempotency_records SET response_status = 200, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 200, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/stock-adjustments', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const body = request.body || {};
    if (typeof body.productId !== 'string' || !UUID_PATTERN.test(body.productId)) throw new ApiError(400, 'validation_error', 'Sản phẩm không hợp lệ.');
    const warehouseInput = body.warehouseId;
    if (warehouseInput !== undefined && (typeof warehouseInput !== 'string' || !UUID_PATTERN.test(warehouseInput))) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    const requestedWarehouseId = warehouseInput?.toLowerCase() || null;
    const countMilli = quantityMilli(body.count, 'Số lượng kiểm kê');
    const expectedInventoryVersion = body.expectedInventoryVersion;
    if (!Number.isSafeInteger(expectedInventoryVersion) || expectedInventoryVersion < 1) throw new ApiError(400, 'validation_error', 'Phiên bản tồn kho không hợp lệ. Hãy tải lại danh sách.');
    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'Kiểm kê thực tế';
    if (!reason || reason.length > 500) throw new ApiError(400, 'validation_error', 'Lý do điều chỉnh cần từ 1 đến 500 ký tự.');
    const value = { productId: body.productId, countMilli: countMilli.toString(), expectedInventoryVersion, reason };
    if (requestedWarehouseId) value.warehouseId = requestedWarehouseId;
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền điều chỉnh tồn kho.');
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId || null, { lock: true });
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      const warehouseId = warehouse.id;
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, digest]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu thao tác đã được dùng cho dữ liệu khác.');
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Thao tác đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const productResult = await client.query(
        `SELECT p.id, p.name, p.status, p.inventory_tracked, b.on_hand::text AS on_hand, b.reserved::text AS reserved, b.version AS inventory_version
         FROM products p JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id AND b.warehouse_id = $3
         WHERE p.store_id = $1 AND p.id = $2 FOR UPDATE OF p, b`,
        [storeId, body.productId, warehouseId]
      );
      if (!productResult.rowCount || productResult.rows[0].status !== 'active') throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang hoạt động.');
      const product = productResult.rows[0];
      if (Number(product.inventory_version) !== expectedInventoryVersion) throw new ApiError(409, 'inventory_version_conflict', 'Kho vừa thay đổi do một đơn bán hoặc thao tác khác. Hãy kiểm tra lại số lượng thực tế.');
      if (!product.inventory_tracked) throw new ApiError(409, 'inventory_not_tracked', 'Sản phẩm này không theo dõi tồn kho.');
      const previousMilli = quantityMilli(product.on_hand, 'Tồn kho hiện tại');
      const reservedMilli = quantityMilli(product.reserved, 'Số lượng đã giữ');
      if (countMilli < reservedMilli) throw new ApiError(409, 'reserved_stock', 'Số tồn mới không thể thấp hơn số lượng đã được giữ cho đơn hàng.');
      const deltaMilli = countMilli - previousMilli;
      if (deltaMilli === 0n) throw new ApiError(400, 'no_stock_change', 'Số tồn không thay đổi.');
      const count = quantityText(countMilli);
      const delta = `${deltaMilli < 0n ? '-' : ''}${quantityText(deltaMilli < 0n ? -deltaMilli : deltaMilli)}`;
      const updatedBalance = await client.query(
        `UPDATE inventory_balances SET on_hand = $3::numeric, version = version + 1, updated_at = now()
           WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $4 RETURNING version`,
        [storeId, body.productId, count, warehouseId]
      );
      await client.query(
        `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                           reason, source_type, actor_user_id)
         VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, 'stock_adjustment', $8)`,
        [storeId, warehouseId, body.productId, reason === 'Kiểm kê thực tế' ? 'count' : 'adjustment', delta, count, reason, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'inventory.adjusted', 'product', $3, $4, jsonb_build_object('previous', $5::text, 'counted', $6::text))`,
        [storeId, auth.userId, body.productId, reason, quantityText(previousMilli), count]
      );
      const response = { product: { id: body.productId, onHand: count, delta, version: Number(updatedBalance.rows[0].version) } };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(response)]
      );
      return { status: 201, body: response, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerStockRoutes };
