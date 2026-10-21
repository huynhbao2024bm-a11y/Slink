'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { findAccessibleWarehouse, requireWarehouseAccess } = require('./warehouse-access');
const { lockActiveCashSession } = require('./cash-register');

const ORDER_ROLES = new Set(['owner', 'manager', 'stockkeeper', 'accountant']);
const FINANCE_ROLES = new Set(['owner', 'manager', 'accountant']);
const METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);
const MAX_BIGINT = 9223372036854775807n;
const MAX_LINES = 50;

function quantityMilli(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', 'Số lượng không hợp lệ.');
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(text));
  if (!match) throw new ApiError(400, 'validation_error', 'Số lượng phải lớn hơn 0 và có tối đa 3 chữ số thập phân.');
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
  if (milli <= 0n) throw new ApiError(400, 'validation_error', 'Số lượng phải lớn hơn 0.');
  return milli;
}

function quantityText(milli) {
  const whole = milli / 1000n;
  const fraction = milli % 1000n;
  return fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
}

function amount(value, label, allowZero = true) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if ((typeof text !== 'string' && typeof text !== 'number') || !new RegExp(allowZero ? '^(0|[1-9]\\d{0,18})$' : '^[1-9]\\d{0,18}$').test(String(text))) {
    throw new ApiError(400, 'validation_error', `${label} phải là VND nguyên ${allowZero ? 'không âm' : 'dương'}.`);
  }
  const parsed = BigInt(text);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function parseLines(rawItems, field = 'productId') {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_LINES) {
    throw new ApiError(400, 'validation_error', `Đơn cần từ 1 đến ${MAX_LINES} dòng hàng.`);
  }
  const seen = new Set();
  let total = 0n;
  const items = rawItems.map((raw) => {
    const id = raw?.[field];
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new ApiError(400, 'validation_error', 'Một dòng hàng có mã không hợp lệ.');
    const idValue = id.toLowerCase();
    if (seen.has(idValue)) throw new ApiError(400, 'validation_error', 'Một sản phẩm chỉ được xuất hiện một lần trong đơn.');
    seen.add(idValue);
    const quantity = quantityMilli(raw.quantity);
    const unitCostVnd = amount(raw.unitCostVnd, 'Giá nhập');
    const lineTotalVnd = (unitCostVnd * quantity + 500n) / 1000n;
    if (lineTotalVnd > MAX_BIGINT || total + lineTotalVnd > MAX_BIGINT) throw new ApiError(400, 'validation_error', 'Tổng giá trị đơn vượt giới hạn lưu trữ.');
    total += lineTotalVnd;
    return { id: idValue, quantity, quantityText: quantityText(quantity), unitCostVnd, lineTotalVnd };
  });
  return { items, total };
}

function requireIdempotencyKey(request) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
  return key;
}

async function reserveIdempotency(client, storeId, actorId, key, digest) {
  const reserved = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, actorId, key, digest]
  );
  if (reserved.rowCount) return null;
  const previous = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, actorId, key]
  );
  const record = previous.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã được dùng cho dữ liệu khác.');
  if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Thao tác đang được xử lý. Hãy thử lại sau.');
  return { status: record.response_status, body: record.response_body, replayed: true };
}

async function saveIdempotentResponse(client, storeId, actorId, key, status, body) {
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

async function selectProducts(client, storeId, items) {
  const ids = items.map((item) => item.id);
  const selected = await client.query(
    `SELECT id, name, sku, unit, status, inventory_tracked
     FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
    [storeId, ids]
  );
  const byId = new Map(selected.rows.map((row) => [row.id, row]));
  if (byId.size !== items.length) throw new ApiError(404, 'product_not_found', 'Không tìm thấy đủ sản phẩm trong cửa hàng. Đơn chưa được lưu.');
  for (const item of items) if (byId.get(item.id).status !== 'active') throw new ApiError(409, 'product_inactive', 'Một sản phẩm trong đơn đã ngừng kinh doanh.');
  return byId;
}

function registerPurchaseOrderRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/purchase-orders', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const key = requireIdempotencyKey(request);
    const body = request.body || {};
    if (typeof body.supplierId !== 'string' || !UUID_PATTERN.test(body.supplierId)) throw new ApiError(400, 'validation_error', 'Chọn nhà cung cấp đang hoạt động.');
    const supplierId = body.supplierId.toLowerCase();
    const requestedWarehouseId = body.warehouseId || null;
    if (requestedWarehouseId !== null && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) throw new ApiError(400, 'validation_error', 'Kho nhận hàng không hợp lệ.');
    const warehouseIdInput = requestedWarehouseId?.toLowerCase() || null;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú không được vượt quá 500 ký tự.');
    const { items, total } = parseLines(body.items);
    const canonical = { supplierId, note, items: items.map((item) => ({ productId: item.id, quantityMilli: item.quantity.toString(), unitCostVnd: item.unitCostVnd.toString() })) };
    if (warehouseIdInput) canonical.warehouseId = warehouseIdInput;
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo đơn đặt hàng.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const warehouse = await findAccessibleWarehouse(client, storeId, membership, warehouseIdInput, { lock: true });
      if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận hàng đang hoạt động.');
      const warehouseId = warehouse.id;
      const supplier = await client.query(`SELECT id, name FROM suppliers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [storeId, supplierId]);
      if (!supplier.rowCount) throw new ApiError(404, 'supplier_not_found', 'Không tìm thấy nhà cung cấp đang hoạt động.');
      const products = await selectProducts(client, storeId, items);
      const sequence = await client.query(
        `UPDATE store_sequences SET next_purchase_order_number = next_purchase_order_number + 1
         WHERE store_id = $1 RETURNING next_purchase_order_number - 1 AS order_number`,
        [storeId]
      );
      if (!sequence.rowCount) throw new Error('Store purchase order sequence is missing.');
      const number = `PO-${sequence.rows[0].order_number}`;
      const orderId = randomUUID();
      await client.query(
        `INSERT INTO purchase_orders (id, store_id, purchase_order_number, supplier_id, warehouse_id, status, subtotal_vnd, total_vnd, note, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6, $7, $8)`,
        [orderId, storeId, number, supplierId, warehouseId, total.toString(), note, auth.userId]
      );
      for (const item of items) {
        const product = products.get(item.id);
        await client.query(
          `INSERT INTO purchase_order_lines (store_id, purchase_order_id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot,
                                             quantity_ordered, unit_cost_vnd, line_total_vnd)
           VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9)`,
          [storeId, orderId, product.id, product.name, product.sku, product.unit, item.quantityText, item.unitCostVnd.toString(), item.lineTotalVnd.toString()]
        );
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'purchase_order.created', 'purchase_order', $3, $4,
                 jsonb_build_object('purchaseOrderNumber', $5::text, 'lineCount', $6::integer, 'totalVnd', $7::text, 'status', 'draft'))`,
        [storeId, auth.userId, orderId, note, number, items.length, total.toString()]
      );
      const response = { purchaseOrder: { id: orderId, number, supplierId, supplierName: supplier.rows[0].name, warehouseId, warehouseName: warehouse.name, status: 'draft', version: 1, totalVnd: total.toString(), note } };
      await saveIdempotentResponse(client, storeId, auth.userId, key, 201, response);
      return { status: 201, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });

  app.put('/api/stores/:storeId/purchase-orders/:orderId', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Đơn đặt hàng không hợp lệ.');
    const key = requireIdempotencyKey(request);
    const body = request.body || {};
    const version = Number(body.version);
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'validation_error', 'Thiếu phiên bản đơn đặt hàng. Hãy tải lại trước khi sửa.');
    if (typeof body.supplierId !== 'string' || !UUID_PATTERN.test(body.supplierId)) throw new ApiError(400, 'validation_error', 'Chọn nhà cung cấp đang hoạt động.');
    const supplierId = body.supplierId.toLowerCase();
    const requestedWarehouseId = body.warehouseId || null;
    if (requestedWarehouseId !== null && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) throw new ApiError(400, 'validation_error', 'Kho nhận hàng không hợp lệ.');
    const warehouseIdInput = requestedWarehouseId?.toLowerCase() || null;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú không được vượt quá 500 ký tự.');
    const { items, total } = parseLines(body.items);
    const canonical = { orderId, version, supplierId, note, items: items.map((item) => ({ productId: item.id, quantityMilli: item.quantity.toString(), unitCostVnd: item.unitCostVnd.toString() })) };
    if (warehouseIdInput) canonical.warehouseId = warehouseIdInput;
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền sửa đơn đặt hàng.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const current = await client.query(`SELECT id, purchase_order_number, warehouse_id, status, version FROM purchase_orders WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, orderId]);
      if (!current.rowCount) throw new ApiError(404, 'purchase_order_not_found', 'Không tìm thấy đơn đặt hàng.');
      requireWarehouseAccess(membership, current.rows[0].warehouse_id);
      if (current.rows[0].status !== 'draft') throw new ApiError(409, 'purchase_order_not_editable', 'Chỉ có thể sửa đơn đang ở trạng thái nháp.');
      if (current.rows[0].version !== version) throw new ApiError(409, 'stale_purchase_order', 'Đơn đã được thay đổi ở thiết bị khác. Hãy tải lại trước khi sửa.');
      const warehouseId = warehouseIdInput || current.rows[0].warehouse_id;
      const warehouseResult = await findAccessibleWarehouse(client, storeId, membership, warehouseId, { lock: true });
      if (!warehouseResult) throw new ApiError(409, 'warehouse_inactive', 'Kho nhận của đơn đã lưu trữ hoặc không nằm trong phạm vi được giao.');
      const supplier = await client.query(`SELECT id, name FROM suppliers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [storeId, supplierId]);
      if (!supplier.rowCount) throw new ApiError(404, 'supplier_not_found', 'Không tìm thấy nhà cung cấp đang hoạt động.');
      const products = await selectProducts(client, storeId, items);
      await client.query(`DELETE FROM purchase_order_lines WHERE store_id = $1 AND purchase_order_id = $2`, [storeId, orderId]);
      for (const item of items) {
        const product = products.get(item.id);
        await client.query(
          `INSERT INTO purchase_order_lines (store_id, purchase_order_id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot,
                                             quantity_ordered, unit_cost_vnd, line_total_vnd)
           VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9)`,
          [storeId, orderId, product.id, product.name, product.sku, product.unit, item.quantityText, item.unitCostVnd.toString(), item.lineTotalVnd.toString()]
        );
      }
      const updated = await client.query(
        `UPDATE purchase_orders SET supplier_id = $3, warehouse_id = $6, subtotal_vnd = $4, total_vnd = $4, note = $5,
                                    version = version + 1, updated_at = now()
         WHERE store_id = $1 AND id = $2 RETURNING version`,
        [storeId, orderId, supplierId, total.toString(), note, warehouseId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'purchase_order.updated', 'purchase_order', $3, $4,
                 jsonb_build_object('lineCount', $5::integer, 'totalVnd', $6::text, 'version', $7::integer))`,
        [storeId, auth.userId, orderId, note, items.length, total.toString(), updated.rows[0].version]
      );
      const response = { purchaseOrder: { id: orderId, number: current.rows[0].purchase_order_number, supplierId, supplierName: supplier.rows[0].name, warehouseId, warehouseName: warehouseResult.name, status: 'draft', version: updated.rows[0].version, totalVnd: total.toString(), note } };
      await saveIdempotentResponse(client, storeId, auth.userId, key, 200, response);
      return { status: 200, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });

  for (const action of ['place', 'cancel']) {
    app.post(`/api/stores/:storeId/purchase-orders/:orderId/${action}`, async (request, reply) => {
      const auth = await authenticate(pool, request);
      requireCsrf(request, env);
      const { storeId, orderId } = request.params;
      if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Đơn đặt hàng không hợp lệ.');
      const key = requireIdempotencyKey(request);
      const body = request.body || {};
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (action === 'cancel' && (reason.length < 3 || reason.length > 500)) throw new ApiError(400, 'validation_error', 'Nhập lý do hủy từ 3 đến 500 ký tự.');
      const canonical = action === 'place' ? { action, orderId } : { action, orderId, reason };
      const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
      const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        if (!ORDER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền cập nhật đơn đặt hàng.');
        const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
        if (replay) return replay;
        const current = await client.query(`SELECT id, purchase_order_number, warehouse_id, status, total_vnd::text AS total_vnd FROM purchase_orders WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, orderId]);
        if (!current.rowCount) throw new ApiError(404, 'purchase_order_not_found', 'Không tìm thấy đơn đặt hàng.');
        const row = current.rows[0];
        requireWarehouseAccess(membership, row.warehouse_id);
        if (action === 'place') {
          if (row.status !== 'draft') throw new ApiError(409, 'purchase_order_state_conflict', 'Chỉ có thể gửi nhà cung cấp đơn đang ở trạng thái nháp.');
          await client.query(`UPDATE purchase_orders SET status = 'ordered', ordered_at = now(), updated_at = now(), version = version + 1 WHERE store_id = $1 AND id = $2`, [storeId, orderId]);
        } else {
          if (!['draft', 'ordered', 'partially_received'].includes(row.status)) throw new ApiError(409, 'purchase_order_state_conflict', 'Đơn đã nhận đủ hoặc đã hủy nên không thể hủy.');
          await client.query(`UPDATE purchase_orders SET status = 'cancelled', cancelled_at = now(), updated_at = now(), version = version + 1 WHERE store_id = $1 AND id = $2`, [storeId, orderId]);
        }
        const status = action === 'place' ? 'ordered' : 'cancelled';
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, $3, 'purchase_order', $4, $5,
                   jsonb_build_object('purchaseOrderNumber', $6::text, 'fromStatus', $7::text, 'toStatus', $8::text, 'totalVnd', $9::text))`,
          [storeId, auth.userId, action === 'place' ? 'purchase_order.placed' : 'purchase_order.cancelled', orderId, action === 'cancel' ? reason : '', row.purchase_order_number, row.status, status, row.total_vnd]
        );
        const response = { purchaseOrder: { id: orderId, number: row.purchase_order_number, status } };
        await saveIdempotentResponse(client, storeId, auth.userId, key, 200, response);
        return { status: 200, body: response, replayed: false };
      });
      return finish(reply, outcome);
    });
  }

  app.post('/api/stores/:storeId/purchase-orders/:orderId/receipts', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Đơn đặt hàng không hợp lệ.');
    const key = requireIdempotencyKey(request);
    const body = request.body || {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length < 1 || rawItems.length > MAX_LINES) throw new ApiError(400, 'validation_error', `Mỗi lần nhận cần từ 1 đến ${MAX_LINES} dòng hàng.`);
    const seen = new Set();
    const items = rawItems.map((raw) => {
      if (typeof raw?.purchaseOrderLineId !== 'string' || !UUID_PATTERN.test(raw.purchaseOrderLineId)) throw new ApiError(400, 'validation_error', 'Một dòng nhận hàng không hợp lệ.');
      const id = raw.purchaseOrderLineId.toLowerCase();
      if (seen.has(id)) throw new ApiError(400, 'validation_error', 'Một dòng trong đơn chỉ được nhận một lần cho mỗi chuyến.');
      seen.add(id);
      const quantity = quantityMilli(raw.quantity);
      return { id, quantity, quantityText: quantityText(quantity) };
    });
    const paidVnd = amount(body.amountPaidVnd ?? 0, 'Số tiền đã thanh toán');
    const method = body.method || 'cash';
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú không được vượt quá 500 ký tự.');
    if (!METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức thanh toán không hợp lệ.');
    const canonical = { orderId, items: items.map((item) => ({ lineId: item.id, quantityMilli: item.quantity.toString() })), paidVnd: paidVnd.toString(), method, note };
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền nhận hàng.');
      if (!FINANCE_ROLES.has(membership.role) && paidVnd > 0n) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được ghi nhận thanh toán khi nhận hàng.');
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, digest);
      if (replay) return replay;
      const orderResult = await client.query(
        `SELECT po.id, po.purchase_order_number, po.status, po.supplier_id, po.warehouse_id, po.note,
                s.name AS supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.store_id = po.store_id AND s.id = po.supplier_id
         WHERE po.store_id = $1 AND po.id = $2 FOR UPDATE OF po`,
        [storeId, orderId]
      );
      if (!orderResult.rowCount) throw new ApiError(404, 'purchase_order_not_found', 'Không tìm thấy đơn đặt hàng.');
      const order = orderResult.rows[0];
      requireWarehouseAccess(membership, order.warehouse_id);
      if (!['ordered', 'partially_received'].includes(order.status)) throw new ApiError(409, 'purchase_order_not_receivable', 'Chỉ đơn đã gửi và chưa nhận đủ mới có thể nhận hàng.');
      const warehouse = await client.query(
        `SELECT id FROM warehouses WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
        [storeId, order.warehouse_id]
      );
      if (!warehouse.rowCount) throw new ApiError(409, 'warehouse_inactive', 'Kho nhận của đơn đã lưu trữ. Hãy liên hệ quản lý trước khi nhận hàng.');
      const orderLines = await client.query(
        `SELECT pol.id, pol.product_id, pol.product_name_snapshot, pol.sku_snapshot, pol.unit_snapshot,
                pol.quantity_ordered::text AS quantity_ordered, pol.quantity_received::text AS quantity_received,
                pol.unit_cost_vnd::text AS unit_cost_vnd, p.inventory_tracked
         FROM purchase_order_lines pol JOIN products p ON p.store_id = pol.store_id AND p.id = pol.product_id
         WHERE pol.store_id = $1 AND pol.purchase_order_id = $2
         ORDER BY pol.product_id FOR UPDATE OF pol, p`,
        [storeId, orderId]
      );
      const lineMap = new Map(orderLines.rows.map((line) => [line.id, line]));
      if (!orderLines.rowCount) throw new ApiError(409, 'purchase_order_empty', 'Đơn không có dòng hàng để nhận.');
      const receiptItems = [];
      let total = 0n;
      for (const item of items) {
        const line = lineMap.get(item.id);
        if (!line) throw new ApiError(404, 'purchase_order_line_not_found', 'Không tìm thấy dòng hàng trong đơn đặt hàng.');
        const toMilli = (value) => {
          const parts = String(value).split('.');
          return BigInt(parts[0]) * 1000n + BigInt((parts[1] || '').padEnd(3, '0'));
        };
        const remaining = toMilli(line.quantity_ordered) - toMilli(line.quantity_received);
        if (item.quantity > remaining) throw new ApiError(409, 'purchase_order_quantity_exceeded', `Số nhận vượt số còn lại của sản phẩm ${line.sku_snapshot}.`);
        const lineTotalVnd = (BigInt(line.unit_cost_vnd) * item.quantity + 500n) / 1000n;
        if (total + lineTotalVnd > MAX_BIGINT) throw new ApiError(400, 'validation_error', 'Tổng phiếu nhận vượt giới hạn lưu trữ.');
        total += lineTotalVnd;
        receiptItems.push({ ...item, line, lineTotalVnd });
      }
      if (paidVnd > total) throw new ApiError(400, 'validation_error', 'Số tiền thanh toán không được vượt tổng phiếu nhận lần này.');
      if (total > 0n && !order.supplier_name) throw new ApiError(409, 'supplier_required', 'Đơn đặt hàng cần nhà cung cấp để theo dõi khoản phải trả.');
      const productIds = [...new Set(receiptItems.map((item) => item.line.product_id))];
      const products = await client.query(`SELECT id FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`, [storeId, productIds]);
      if (products.rowCount !== productIds.length) throw new ApiError(409, 'product_not_found', 'Một sản phẩm trong đơn không còn khả dụng.');
      await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
      const cashSessionId = paidVnd > 0n && method === 'cash' ? await lockActiveCashSession(client, storeId, { cashOutVnd: paidVnd }) : null;
      const supplierLock = await client.query(`SELECT id FROM suppliers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, order.supplier_id]);
      if (!supplierLock.rowCount) throw new ApiError(409, 'supplier_missing', 'Không tìm thấy nhà cung cấp của đơn.');
      const sequence = await client.query(
        `UPDATE store_sequences SET next_purchase_number = next_purchase_number + 1
         WHERE store_id = $1 RETURNING next_purchase_number - 1 AS purchase_number`,
        [storeId]
      );
      if (!sequence.rowCount) throw new Error('Store purchase sequence is missing.');
      const receiptNumber = `GRN-${sequence.rows[0].purchase_number}`;
      const purchaseId = randomUUID();
      await client.query(
        `INSERT INTO purchases (id, store_id, purchase_number, supplier_id, warehouse_id, purchase_order_id, status, subtotal_vnd, tax_vnd, total_vnd,
                               note, created_by, received_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'received', $7, 0, $7, $8, $9, now())`,
        [purchaseId, storeId, receiptNumber, order.supplier_id, order.warehouse_id, orderId, total.toString(), note, auth.userId]
      );
      for (const item of receiptItems) {
        const line = item.line;
        await client.query(
          `INSERT INTO purchase_lines (store_id, purchase_id, purchase_order_line_id, product_id, product_name_snapshot, sku_snapshot, unit_snapshot,
                                       quantity_ordered, quantity_received, unit_cost_vnd, line_total_vnd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $8::numeric, $9, $10)`,
          [storeId, purchaseId, line.id, line.product_id, line.product_name_snapshot, line.sku_snapshot, line.unit_snapshot, item.quantityText, line.unit_cost_vnd, item.lineTotalVnd.toString()]
        );
        await client.query(`UPDATE purchase_order_lines SET quantity_received = quantity_received + $3::numeric WHERE store_id = $1 AND id = $2`, [storeId, line.id, item.quantityText]);
        await client.query(`UPDATE products SET cost_vnd = $3, version = version + 1, updated_at = now() WHERE store_id = $1 AND id = $2`, [storeId, line.product_id, line.unit_cost_vnd]);
        await client.query(
          `INSERT INTO product_cost_history (store_id, product_id, unit_cost_vnd, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'purchase', $4, $5)`,
          [storeId, line.product_id, line.unit_cost_vnd, purchaseId, auth.userId]
        );
        if (line.inventory_tracked) {
          const balance = await client.query(
            `UPDATE inventory_balances SET on_hand = on_hand + $3::numeric, version = version + 1, updated_at = now()
             WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $4
             RETURNING on_hand::text AS on_hand`,
            [storeId, line.product_id, item.quantityText, order.warehouse_id]
          );
          if (!balance.rowCount) throw new ApiError(409, 'inventory_balance_missing', 'Thiếu số dư kho để nhận mặt hàng. Chưa có thay đổi nào được ghi.');
          await client.query(
            `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after, reason, source_type, source_id, actor_user_id)
             VALUES ($1, $2, $3, 'purchase_receipt', $4::numeric, $5::numeric, $6, 'purchase', $7, $8)`,
            [storeId, order.warehouse_id, line.product_id, item.quantityText, balance.rows[0].on_hand, `Nhận ${receiptNumber} từ ${order.purchase_order_number}`, purchaseId, auth.userId]
          );
        }
      }
      if (total > 0n) {
        await client.query(
          `INSERT INTO supplier_ledger_entries (store_id, supplier_id, entry_type, increases_payable_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'purchase_credit', $3, 'purchase', $4, $5, $6)`,
          [storeId, order.supplier_id, total.toString(), purchaseId, `Nhận ${receiptNumber} · ${order.purchase_order_number}`, auth.userId]
        );
      }
      if (paidVnd > 0n) {
        await client.query(
          `INSERT INTO supplier_ledger_entries (store_id, supplier_id, entry_type, decreases_payable_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'payment_debit', $3, 'purchase_payment', $4, $5, $6)`,
          [storeId, order.supplier_id, paidVnd.toString(), purchaseId, `Đã thanh toán phiếu ${receiptNumber}`, auth.userId]
        );
        await client.query(
          `INSERT INTO cash_movements (store_id, direction, category, amount_vnd, method, source_type, source_id, note, actor_user_id, cash_session_id)
           VALUES ($1, 'out', 'Nhập hàng', $2, $3, 'purchase_payment', $4, $5, $6, $7)`,
          [storeId, paidVnd.toString(), method, purchaseId, `Thanh toán ${receiptNumber}`, auth.userId, cashSessionId]
        );
      }
      const orderStatus = await client.query(
        `SELECT COUNT(*)::int AS line_count,
                COUNT(*) FILTER (WHERE quantity_received = quantity_ordered)::int AS completed_count
         FROM purchase_order_lines WHERE store_id = $1 AND purchase_order_id = $2`,
        [storeId, orderId]
      );
      const complete = orderStatus.rows[0].line_count > 0 && orderStatus.rows[0].line_count === orderStatus.rows[0].completed_count;
      const nextStatus = complete ? 'received' : 'partially_received';
      await client.query(
        `UPDATE purchase_orders SET status = $3, completed_at = CASE WHEN $3 = 'received' THEN now() ELSE NULL END,
                                    updated_at = now(), version = version + 1 WHERE store_id = $1 AND id = $2`,
        [storeId, orderId, nextStatus]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'purchase.received', 'purchase', $3, $4,
                 jsonb_build_object('purchaseNumber', $5::text, 'lineCount', $6::integer, 'totalVnd', $7::text, 'purchaseOrderId', $8::text))`,
        [storeId, auth.userId, purchaseId, note, receiptNumber, receiptItems.length, total.toString(), orderId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'purchase_order.receipt_recorded', 'purchase_order', $3, $4,
                 jsonb_build_object('purchaseOrderNumber', $5::text, 'receiptNumber', $6::text, 'status', $7::text,
                                    'receivedLineCount', $8::integer, 'totalVnd', $9::text))`,
        [storeId, auth.userId, orderId, note, order.purchase_order_number, receiptNumber, nextStatus, receiptItems.length, total.toString()]
      );
      const response = {
        purchaseOrder: { id: orderId, number: order.purchase_order_number, status: nextStatus },
        purchase: { id: purchaseId, number: receiptNumber, itemCount: receiptItems.length, totalVnd: total.toString(), paidVnd: paidVnd.toString() },
      };
      await saveIdempotentResponse(client, storeId, auth.userId, key, 201, response);
      return { status: 201, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });
}

module.exports = { registerPurchaseOrderRoutes };
