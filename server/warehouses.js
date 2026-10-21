'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { allowedWarehouseIds, canAccessWarehouse } = require('./warehouse-access');

const STOCK_ROLES = new Set(['owner', 'manager', 'stockkeeper']);
const MANAGER_ROLES = new Set(['owner', 'manager']);
const MAX_LINES = 100;

function quantityMilli(value, { positive = false } = {}) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', 'Số lượng không hợp lệ.');
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(text));
  if (!match) throw new ApiError(400, 'validation_error', 'Số lượng phải không âm và có tối đa 3 chữ số thập phân.');
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
  if (positive && milli === 0n) throw new ApiError(400, 'validation_error', 'Số lượng phải lớn hơn 0.');
  return milli;
}

function quantityText(milli) {
  const whole = milli / 1000n;
  const fraction = milli % 1000n;
  return fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
}

function parseItems(raw, idField = 'productId') {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LINES) {
    throw new ApiError(400, 'validation_error', `Mỗi lần điều chuyển cần từ 1 đến ${MAX_LINES} dòng hàng.`);
  }
  const seen = new Set();
  return raw.map((item) => {
    if (typeof item?.[idField] !== 'string' || !UUID_PATTERN.test(item[idField])) throw new ApiError(400, 'validation_error', 'Một dòng hàng có mã không hợp lệ.');
    const id = item[idField].toLowerCase();
    if (seen.has(id)) throw new ApiError(400, 'validation_error', 'Không thể lặp lại cùng một mặt hàng trong phiếu.');
    seen.add(id);
    const milli = quantityMilli(item.quantity, { positive: true });
    return { id, milli, quantity: quantityText(milli) };
  });
}

function requireKey(request) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
  return key;
}

async function reserveIdempotency(client, storeId, actorId, key, digest) {
  const inserted = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, actorId, key, digest]
  );
  if (inserted.rowCount) return null;
  const previous = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, actorId, key]
  );
  const record = previous.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã được dùng cho nội dung khác.');
  if (!record.response_status || !record.response_body) throw new ApiError(409, 'request_in_progress', 'Thao tác đang được xử lý. Hãy kiểm tra lại sau.');
  return { status: record.response_status, body: record.response_body, replayed: true };
}

async function saveResponse(client, storeId, actorId, key, status, body) {
  await client.query(
    `UPDATE idempotency_records SET response_status = $4, response_body = $5::jsonb, completed_at = now()
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [storeId, actorId, key, status, JSON.stringify(body)]
  );
}

function finish(reply, outcome) {
  if (outcome.replayed) reply.header('idempotent-replayed', 'true');
  return reply.code(outcome.status).send(outcome.body);
}

function registerWarehouseRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/warehouses', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const warehouseIds = allowedWarehouseIds(membership);
      const result = await client.query(
        `SELECT w.id, w.code, w.name, w.is_default, w.status, w.version,
                COUNT(DISTINCT b.product_id) FILTER (WHERE b.on_hand > 0)::int AS stocked_product_count,
                COALESCE(SUM(b.on_hand), 0)::text AS total_units
         FROM warehouses w LEFT JOIN inventory_balances b ON b.store_id = w.store_id AND b.warehouse_id = w.id
         WHERE w.store_id = $1 AND ($2::boolean = false OR (w.status = 'active' AND w.id = ANY($3::uuid[])))
         GROUP BY w.id ORDER BY w.is_default DESC, w.name, w.id`,
        [storeId, warehouseIds !== null, warehouseIds || []]
      );
      return { warehouses: result.rows };
    });
  });

  app.post('/api/stores/:storeId/warehouses', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,31}$/u.test(code)) throw new ApiError(400, 'validation_error', 'Mã kho cần 1–32 chữ cái, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    if (name.length < 2 || name.length > 120) throw new ApiError(400, 'validation_error', 'Tên kho cần từ 2 đến 120 ký tự.');
    const key = requireKey(request);
    const canonical = { code: code.toLocaleLowerCase('vi'), name };
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!MANAGER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được tạo kho.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const id = randomUUID();
      try {
        await client.query(
          `INSERT INTO warehouses (id, store_id, code, code_normalized, name, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, storeId, code, canonical.code, name, auth.userId]
        );
        await client.query(
          `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand)
           SELECT $1, $2, p.id, 0 FROM products p
           WHERE p.store_id = $1 AND p.inventory_tracked = true AND p.status = 'active'
           ON CONFLICT (store_id, warehouse_id, product_id) DO NOTHING`,
          [storeId, id]
        );
      } catch (error) {
        if (error.code === '23505') throw new ApiError(409, 'warehouse_code_conflict', 'Mã kho này đã được dùng trong cửa hàng.');
        throw error;
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'warehouse.created', 'warehouse', $3, jsonb_build_object('code', $4::text, 'name', $5::text))`,
        [storeId, auth.userId, id, code, name]
      );
      const body = { warehouse: { id, code, name, is_default: false, status: 'active', version: 1, stocked_product_count: 0, total_units: '0' } };
      await saveResponse(client, storeId, auth.userId, key, 201, body);
      return { status: 201, body, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.post('/api/stores/:storeId/warehouses/:warehouseId/archive', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, warehouseId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(warehouseId)) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');
    const key = requireKey(request);
    const digest = createHash('sha256').update(JSON.stringify({ action: 'archive', warehouseId })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!MANAGER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được lưu trữ kho.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const warehouse = await client.query(`SELECT id, code, name, is_default, status FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, warehouseId]);
      if (!warehouse.rowCount) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho.');
      if (warehouse.rows[0].is_default) throw new ApiError(409, 'default_warehouse_required', 'Không thể lưu trữ kho chính.');
      if (warehouse.rows[0].status === 'archived') {
        const body = { warehouse: { id: warehouseId, status: 'archived' } };
        await saveResponse(client, storeId, auth.userId, key, 200, body);
        return { status: 200, body, replayed: false };
      }
      const nonzero = await client.query(`SELECT 1 FROM inventory_balances WHERE store_id = $1 AND warehouse_id = $2 AND (on_hand <> 0 OR reserved <> 0) LIMIT 1 FOR UPDATE`, [storeId, warehouseId]);
      const openTransfer = await client.query(
        `SELECT 1 FROM warehouse_transfers WHERE store_id = $1 AND status IN ('draft', 'in_transit', 'partially_received')
           AND (source_warehouse_id = $2 OR destination_warehouse_id = $2) LIMIT 1`,
        [storeId, warehouseId]
      );
      const openPurchaseOrder = await client.query(
        `SELECT id FROM purchase_orders WHERE store_id = $1 AND warehouse_id = $2
           AND status IN ('draft', 'ordered', 'partially_received') ORDER BY id LIMIT 1`,
        [storeId, warehouseId]
      );
      if (nonzero.rowCount || openTransfer.rowCount || openPurchaseOrder.rowCount) {
        throw new ApiError(409, 'warehouse_not_empty', 'Kho còn hàng, đơn đặt hàng chưa nhận đủ hoặc phiếu điều chuyển đang mở. Hãy xử lý trước khi lưu trữ.');
      }
      await client.query(`UPDATE warehouses SET status = 'archived', version = version + 1, updated_at = now() WHERE store_id = $1 AND id = $2`, [storeId, warehouseId]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'warehouse.archived', 'warehouse', $3, $4)`,
        [storeId, auth.userId, warehouseId, typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : '']
      );
      const body = { warehouse: { id: warehouseId, status: 'archived' } };
      await saveResponse(client, storeId, auth.userId, key, 200, body);
      return { status: 200, body, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.get('/api/stores/:storeId/warehouse-transfers', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const limitValue = Number(request.query?.limit || 50);
    const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(limitValue, 100)) : 50;
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role) && membership.role !== 'accountant') throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem phiếu điều chuyển.');
      const warehouseIds = allowedWarehouseIds(membership);
      const result = await client.query(
        `SELECT t.id, t.transfer_number, t.status, t.note, t.version, t.dispatched_at, t.completed_at, t.created_at,
                sw.id AS source_warehouse_id, sw.code AS source_warehouse_code, sw.name AS source_warehouse_name,
                dw.id AS destination_warehouse_id, dw.code AS destination_warehouse_code, dw.name AS destination_warehouse_name,
                COALESCE((SELECT json_agg(json_build_object('id', l.id, 'productId', l.product_id,
                  'productName', l.product_name_snapshot, 'sku', l.sku_snapshot, 'unit', l.unit_snapshot,
                  'quantitySent', l.quantity_sent::text, 'quantityReceived', l.quantity_received::text)
                  ORDER BY l.sku_snapshot, l.id) FROM warehouse_transfer_lines l WHERE l.store_id = t.store_id AND l.transfer_id = t.id), '[]'::json) AS lines
         FROM warehouse_transfers t
         JOIN warehouses sw ON sw.store_id = t.store_id AND sw.id = t.source_warehouse_id
         JOIN warehouses dw ON dw.store_id = t.store_id AND dw.id = t.destination_warehouse_id
         WHERE t.store_id = $1 AND ($3::boolean = false OR sw.id = ANY($4::uuid[]) OR dw.id = ANY($4::uuid[]))
         ORDER BY t.created_at DESC, t.id DESC LIMIT $2`,
        [storeId, limit, warehouseIds !== null, warehouseIds || []]
      );
      return { transfers: result.rows };
    });
  });

  app.post('/api/stores/:storeId/warehouse-transfers', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};
    if (!UUID_PATTERN.test(String(body.sourceWarehouseId || '')) || !UUID_PATTERN.test(String(body.destinationWarehouseId || ''))) throw new ApiError(400, 'validation_error', 'Chọn kho xuất và kho nhận.');
    const sourceId = body.sourceWarehouseId.toLowerCase();
    const destinationId = body.destinationWarehouseId.toLowerCase();
    if (sourceId === destinationId) throw new ApiError(400, 'validation_error', 'Kho xuất và kho nhận phải khác nhau.');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú không được vượt quá 500 ký tự.');
    const items = parseItems(body.items);
    const canonical = { sourceId, destinationId, note, items: items.map((item) => ({ productId: item.id, milli: item.milli.toString() })) };
    const key = requireKey(request);
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo phiếu điều chuyển.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const locations = await client.query(
        `SELECT id, code, name, status FROM warehouses WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [storeId, [sourceId, destinationId].sort()]
      );
      if (locations.rowCount !== 2) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho xuất hoặc kho nhận trong cửa hàng.');
      if (locations.rows.some((warehouse) => !canAccessWarehouse(membership, warehouse.id))) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho xuất hoặc kho nhận trong cửa hàng.');
      if (locations.rows.some((row) => row.status !== 'active')) throw new ApiError(409, 'warehouse_inactive', 'Kho đã lưu trữ, không thể tạo điều chuyển mới.');
      const productIds = items.map((item) => item.id).sort();
      const products = await client.query(
        `SELECT id, sku, name, unit, status, inventory_tracked FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [storeId, productIds]
      );
      const productMap = new Map(products.rows.map((product) => [product.id, product]));
      if (productMap.size !== productIds.length || products.rows.some((product) => product.status !== 'active' || !product.inventory_tracked)) throw new ApiError(409, 'product_not_transferable', 'Chỉ có thể điều chuyển sản phẩm đang hoạt động và có theo dõi tồn kho.');
      const sequence = await client.query(
        `UPDATE store_transfer_sequences SET next_transfer_number = next_transfer_number + 1
         WHERE store_id = $1 RETURNING next_transfer_number - 1 AS transfer_number`,
        [storeId]
      );
      if (!sequence.rowCount) throw new Error('Store transfer sequence is missing.');
      const transferId = randomUUID();
      const transferNumber = `TR-${sequence.rows[0].transfer_number}`;
      await client.query(
        `INSERT INTO warehouse_transfers (id, store_id, transfer_number, source_warehouse_id, destination_warehouse_id, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [transferId, storeId, transferNumber, sourceId, destinationId, note, auth.userId]
      );
      for (const item of items) {
        const product = productMap.get(item.id);
        await client.query(
          `INSERT INTO warehouse_transfer_lines (store_id, transfer_id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot, quantity_sent)
           VALUES ($1, $2, $3, $4, $5, $6, $7::numeric)`,
          [storeId, transferId, item.id, product.name, product.sku, product.unit, item.quantity]
        );
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'warehouse_transfer.created', 'warehouse_transfer', $3, $4,
          jsonb_build_object('transferNumber', $5::text, 'sourceWarehouseId', $6::text, 'destinationWarehouseId', $7::text, 'lineCount', $8::integer))`,
        [storeId, auth.userId, transferId, note, transferNumber, sourceId, destinationId, items.length]
      );
      const response = { transfer: { id: transferId, number: transferNumber, sourceWarehouseId: sourceId, destinationWarehouseId: destinationId, status: 'draft', version: 1, note } };
      await saveResponse(client, storeId, auth.userId, key, 201, response);
      return { status: 201, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.post('/api/stores/:storeId/warehouse-transfers/:transferId/dispatch', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, transferId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(transferId)) throw new ApiError(400, 'validation_error', 'Phiếu điều chuyển không hợp lệ.');
    const key = requireKey(request);
    const digest = createHash('sha256').update(JSON.stringify({ action: 'dispatch', transferId })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xuất điều chuyển.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const locked = await client.query(`SELECT * FROM warehouse_transfers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, transferId]);
      if (!locked.rowCount) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      const transfer = locked.rows[0];
      if (!canAccessWarehouse(membership, transfer.source_warehouse_id)) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      if (transfer.status !== 'draft') throw new ApiError(409, 'transfer_state_conflict', 'Chỉ phiếu nháp mới được xuất đi.');
      const lines = await client.query(
        `SELECT id, product_id, sku_snapshot, quantity_sent::text AS quantity_sent FROM warehouse_transfer_lines
         WHERE store_id = $1 AND transfer_id = $2 ORDER BY product_id FOR UPDATE`, [storeId, transferId]
      );
      if (!lines.rowCount) throw new ApiError(409, 'transfer_empty', 'Phiếu không có mặt hàng để xuất.');
      for (const line of lines.rows) {
        const balance = await client.query(
          `SELECT on_hand::text AS on_hand, reserved::text AS reserved FROM inventory_balances
           WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
          [storeId, transfer.source_warehouse_id, line.product_id]
        );
        const milli = (value) => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); };
        if (!balance.rowCount || milli(line.quantity_sent) > milli(balance.rows[0].on_hand) - milli(balance.rows[0].reserved)) {
          throw new ApiError(409, 'insufficient_stock', `Kho xuất không đủ tồn khả dụng cho ${line.sku_snapshot}. Phiếu chưa được xuất.`);
        }
        const updated = await client.query(
          `UPDATE inventory_balances SET on_hand = on_hand - $4::numeric, version = version + 1, updated_at = now()
           WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3 RETURNING on_hand::text AS on_hand`,
          [storeId, transfer.source_warehouse_id, line.product_id, line.quantity_sent]
        );
        await client.query(
          `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after, reason, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'transfer_out', -$4::numeric, $5::numeric, $6, 'warehouse_transfer', $7, $8)`,
          [storeId, transfer.source_warehouse_id, line.product_id, line.quantity_sent, updated.rows[0].on_hand, `Xuất điều chuyển ${transfer.transfer_number}`, transferId, auth.userId]
        );
      }
      await client.query(
        `UPDATE warehouse_transfers SET status = 'in_transit', dispatched_by = $3, dispatched_at = now(), version = version + 1, updated_at = now()
         WHERE store_id = $1 AND id = $2`, [storeId, transferId, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'warehouse_transfer.dispatched', 'warehouse_transfer', $3, $4)`,
        [storeId, auth.userId, transferId, transfer.transfer_number]
      );
      const response = { transfer: { id: transferId, number: transfer.transfer_number, status: 'in_transit' } };
      await saveResponse(client, storeId, auth.userId, key, 200, response);
      return { status: 200, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.post('/api/stores/:storeId/warehouse-transfers/:transferId/receipts', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, transferId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(transferId)) throw new ApiError(400, 'validation_error', 'Phiếu điều chuyển không hợp lệ.');
    const items = parseItems(request.body?.items, 'transferLineId');
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú không được vượt quá 500 ký tự.');
    const key = requireKey(request);
    const canonical = { action: 'receive', transferId, note, items: items.map((item) => ({ lineId: item.id, milli: item.milli.toString() })) };
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền nhận điều chuyển.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const locked = await client.query(`SELECT * FROM warehouse_transfers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, transferId]);
      if (!locked.rowCount) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      const transfer = locked.rows[0];
      if (!canAccessWarehouse(membership, transfer.destination_warehouse_id)) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      if (!['in_transit', 'partially_received'].includes(transfer.status)) throw new ApiError(409, 'transfer_not_receivable', 'Phiếu chưa xuất kho hoặc đã nhận đủ.');
      const lines = await client.query(
        `SELECT id, product_id, sku_snapshot, quantity_sent::text AS quantity_sent, quantity_received::text AS quantity_received
         FROM warehouse_transfer_lines WHERE store_id = $1 AND transfer_id = $2 ORDER BY product_id FOR UPDATE`,
        [storeId, transferId]
      );
      const lineMap = new Map(lines.rows.map((line) => [line.id, line]));
      const milli = (value) => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')); };
      const checked = items.map((item) => {
        const line = lineMap.get(item.id);
        if (!line) throw new ApiError(404, 'transfer_line_not_found', 'Không tìm thấy dòng hàng trong phiếu.');
        if (item.milli > milli(line.quantity_sent) - milli(line.quantity_received)) throw new ApiError(409, 'transfer_quantity_exceeded', `Số nhận vượt lượng đang chuyển của ${line.sku_snapshot}.`);
        return { ...item, line };
      });
      await client.query(`SELECT id FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, transfer.destination_warehouse_id]);
      for (const item of checked) {
        const updated = await client.query(
          `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
           VALUES ($1, $2, $3, $4::numeric, 0)
           ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
             SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
                 version = inventory_balances.version + 1, updated_at = now()
           RETURNING on_hand::text AS on_hand`,
          [storeId, transfer.destination_warehouse_id, item.line.product_id, item.quantity]
        );
        await client.query(
          `UPDATE warehouse_transfer_lines SET quantity_received = quantity_received + $3::numeric WHERE store_id = $1 AND id = $2`,
          [storeId, item.id, item.quantity]
        );
        await client.query(
          `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after, reason, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'transfer_in', $4::numeric, $5::numeric, $6, 'warehouse_transfer', $7, $8)`,
          [storeId, transfer.destination_warehouse_id, item.line.product_id, item.quantity, updated.rows[0].on_hand,
            `Nhận điều chuyển ${transfer.transfer_number}${note ? ` · ${note}` : ''}`, transferId, auth.userId]
        );
      }
      const remaining = await client.query(
        `SELECT COUNT(*)::int AS count FROM warehouse_transfer_lines WHERE store_id = $1 AND transfer_id = $2 AND quantity_received < quantity_sent`,
        [storeId, transferId]
      );
      const status = remaining.rows[0].count ? 'partially_received' : 'received';
      await client.query(
        `UPDATE warehouse_transfers SET status = $3, completed_at = CASE WHEN $3 = 'received' THEN now() ELSE NULL END,
          version = version + 1, updated_at = now() WHERE store_id = $1 AND id = $2`, [storeId, transferId, status]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'warehouse_transfer.received', 'warehouse_transfer', $3, $4,
          jsonb_build_object('lineCount', $5::integer, 'status', $6::text))`,
        [storeId, auth.userId, transferId, note, checked.length, status]
      );
      const response = { transfer: { id: transferId, number: transfer.transfer_number, status }, receivedLineCount: checked.length };
      await saveResponse(client, storeId, auth.userId, key, 200, response);
      return { status: 200, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.post('/api/stores/:storeId/warehouse-transfers/:transferId/cancel', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, transferId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(transferId)) throw new ApiError(400, 'validation_error', 'Phiếu điều chuyển không hợp lệ.');
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) throw new ApiError(400, 'validation_error', 'Nhập lý do hủy từ 3 đến 500 ký tự.');
    const key = requireKey(request);
    const digest = createHash('sha256').update(JSON.stringify({ action: 'cancel', transferId, reason })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STOCK_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền hủy phiếu điều chuyển.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const transfer = await client.query(`SELECT transfer_number, status, source_warehouse_id, destination_warehouse_id FROM warehouse_transfers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, transferId]);
      if (!transfer.rowCount) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      if (!canAccessWarehouse(membership, transfer.rows[0].source_warehouse_id) || !canAccessWarehouse(membership, transfer.rows[0].destination_warehouse_id)) throw new ApiError(404, 'transfer_not_found', 'Không tìm thấy phiếu điều chuyển.');
      if (transfer.rows[0].status !== 'draft') throw new ApiError(409, 'transfer_state_conflict', 'Chỉ phiếu nháp mới được hủy. Phiếu đã xuất phải được nhận đầy đủ.');
      await client.query(`UPDATE warehouse_transfers SET status = 'cancelled', version = version + 1, updated_at = now() WHERE store_id = $1 AND id = $2`, [storeId, transferId]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason)
         VALUES ($1, $2, 'warehouse_transfer.cancelled', 'warehouse_transfer', $3, $4)`,
        [storeId, auth.userId, transferId, reason]
      );
      const response = { transfer: { id: transferId, number: transfer.rows[0].transfer_number, status: 'cancelled' } };
      await saveResponse(client, storeId, auth.userId, key, 200, response);
      return { status: 200, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });
}

module.exports = { registerWarehouseRoutes };
