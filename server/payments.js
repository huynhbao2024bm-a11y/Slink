'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');

const PAYMENT_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);
const MAX_BIGINT = 9223372036854775807n;

function amountVnd(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', 'Số tiền không hợp lệ.');
  const digits = String(text);
  if (!/^[1-9]\d{0,18}$/.test(digits)) throw new ApiError(400, 'validation_error', 'Số tiền phải là VND nguyên dương.');
  const parsed = BigInt(digits);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', 'Số tiền vượt giới hạn lưu trữ.');
  return parsed;
}

function registerPaymentRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/customers/:customerId/payments', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    const amount = amountVnd(request.body?.amountVnd);
    const method = request.body?.method || 'cash';
    if (!METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức thanh toán không hợp lệ.');
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : '';
    if (note.length > 300) throw new ApiError(400, 'validation_error', 'Ghi chú tối đa 300 ký tự.');
    const value = { customerId, amountVnd: amount.toString(), method, note };
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!PAYMENT_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền ghi nhận thu tiền.');
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
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Khoản thu đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      // The customer row serializes all debt settlement for this customer.
      // Sales, returns, voids, and per-order collections take this same lock
      // before changing the customer's ledger or an order balance.
      const customer = await client.query(
        `SELECT id, name FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
        [storeId, customerId]
      );
      if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');

      const ledger = await client.query(
        `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd
         FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
        [storeId, customerId]
      );
      const balance = BigInt(ledger.rows[0].balance_vnd);
      if (balance <= 0n) throw new ApiError(409, 'no_balance_due', 'Khách hàng không còn khoản phải thu.');
      if (amount > balance) throw new ApiError(409, 'payment_exceeds_due', 'Số tiền nhận vượt tổng công nợ còn phải thu của khách hàng.');

      const orders = await client.query(
        `SELECT o.id, o.order_number, o.total_vnd::text AS total_vnd,
                COALESCE((SELECT SUM(p.amount_vnd) FROM payments p
                          WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::text AS paid_vnd,
                COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r
                          WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::text AS returned_vnd,
                COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                          WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd
         FROM orders o
         WHERE o.store_id = $1 AND o.customer_id = $2 AND o.status <> 'voided'
         ORDER BY o.occurred_at, o.id`,
        [storeId, customerId]
      );
      const orderDues = orders.rows.map((order) => ({
        id: order.id,
        number: order.order_number,
        due: BigInt(order.total_vnd) - BigInt(order.returned_vnd) - BigInt(order.paid_vnd) + BigInt(order.refunded_vnd),
      }));
      if (orderDues.some((order) => order.due < 0n)) throw new ApiError(409, 'customer_ledger_mismatch', 'Số dư đơn hàng không khớp sổ công nợ. Hãy kiểm tra lịch sử trước khi thu tiền.');
      const orderDebt = orderDues.reduce((sum, order) => sum + order.due, 0n);
      const openingDebt = balance - orderDebt;
      if (openingDebt < 0n) throw new ApiError(409, 'customer_ledger_mismatch', 'Sổ công nợ thấp hơn tổng khoản nợ theo đơn. Hãy kiểm tra lịch sử trước khi thu tiền.');

      const cashSessionId = method === 'cash' ? await lockActiveCashSession(client, storeId) : null;
      const receiptId = randomUUID();
      let remaining = amount;
      const allocations = [];
      for (const order of orderDues) {
        if (!remaining || !order.due) continue;
        const allocated = remaining < order.due ? remaining : order.due;
        const payment = await client.query(
          `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider_reference, recorded_by)
           VALUES ($1, $2, $3, 'succeeded', $4, NULL, $5) RETURNING id, occurred_at`,
          [storeId, order.id, method, allocated.toString(), auth.userId]
        );
        await client.query(
          `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
          [storeId, customerId, allocated.toString(), payment.rows[0].id, note || `Thu nợ đơn ${order.number}`, auth.userId]
        );
        allocations.push({ orderId: order.id, orderNumber: order.number, paymentId: payment.rows[0].id, amountVnd: allocated.toString() });
        remaining -= allocated;
      }
      if (remaining > 0n) {
        if (remaining > openingDebt) throw new ApiError(409, 'customer_ledger_mismatch', 'Khoản thu không thể phân bổ an toàn vào công nợ hiện tại.');
        await client.query(
          `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'payment_credit', $3, 'customer_payment', $4, $5, $6)`,
          [storeId, customerId, remaining.toString(), receiptId, note || `Thu công nợ khách hàng ${customer.rows[0].name}`, auth.userId]
        );
      }
      await client.query(
        `INSERT INTO cash_movements (store_id, direction, category, amount_vnd, method, source_type, source_id, note, actor_user_id, cash_session_id)
         VALUES ($1, 'in', 'Thu công nợ khách hàng', $2, $3, 'customer_payment', $4, $5, $6, $7)`,
        [storeId, amount.toString(), method, receiptId, note || `Thu công nợ khách hàng ${customer.rows[0].name}`, auth.userId, cashSessionId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer.payment_recorded', 'customer', $3, $4,
                 jsonb_build_object('receiptId', $5::text, 'amountVnd', $6::text, 'method', $7::text,
                                    'openingBalanceAmountVnd', $8::text, 'allocations', $9::jsonb))`,
        [storeId, auth.userId, customerId, note, receiptId, amount.toString(), method,
          (amount - allocations.reduce((sum, item) => sum + BigInt(item.amountVnd), 0n)).toString(), JSON.stringify(allocations)]
      );
      const body = {
        payment: {
          id: receiptId,
          customerId,
          amountVnd: amount.toString(),
          method,
          note,
          customerBalanceVnd: (balance - amount).toString(),
          allocations,
          occurredAt: new Date().toISOString(),
        },
      };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/orders/:orderId/payments', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    const amount = amountVnd(request.body?.amountVnd);
    const method = request.body?.method || 'cash';
    if (!METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức thanh toán không hợp lệ.');
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : '';
    if (note.length > 300) throw new ApiError(400, 'validation_error', 'Ghi chú tối đa 300 ký tự.');
    const value = { amountVnd: amount.toString(), method, note };
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!PAYMENT_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền ghi nhận thu tiền.');
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
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Thanh toán đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }
      const linkedOrder = await client.query(
        'SELECT customer_id FROM orders WHERE store_id = $1 AND id = $2',
        [storeId, orderId]
      );
      if (!linkedOrder.rowCount || !linkedOrder.rows[0].customer_id) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng có thể thu tiền.');
      await client.query(
        `SELECT id FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, linkedOrder.rows[0].customer_id]
      );
      const orderResult = await client.query(
        `SELECT id, order_number, customer_id, status, total_vnd::text AS total_vnd FROM orders
         WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, orderId]
      );
      if (!orderResult.rowCount || orderResult.rows[0].status === 'voided') throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng có thể thu tiền.');
      const order = orderResult.rows[0];
      if (!order.customer_id) throw new ApiError(409, 'customer_required', 'Đơn hàng này chưa gắn khách hàng nên không thể ghi nợ hoặc thu nợ.');
      const sums = await client.query(
        `SELECT
           COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = $1 AND p.order_id = $2 AND p.status = 'succeeded'), 0)::text AS paid_vnd,
           COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id
                     WHERE r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd,
           COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed'), 0)::text AS returned_vnd`,
        [storeId, orderId]
      );
      const paid = BigInt(sums.rows[0].paid_vnd);
      const refunded = BigInt(sums.rows[0].refunded_vnd);
      const returned = BigInt(sums.rows[0].returned_vnd);
      const due = BigInt(order.total_vnd) - returned - paid + refunded;
      if (due <= 0n) throw new ApiError(409, 'no_balance_due', 'Đơn hàng không còn khoản phải thu.');
      if (amount > due) throw new ApiError(409, 'payment_exceeds_due', 'Số tiền thu vượt khoản còn phải thu của đơn hàng.');
      const cashSessionId = method === 'cash' ? await lockActiveCashSession(client, storeId) : null;
      const payment = await client.query(
        `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider_reference, recorded_by)
         VALUES ($1, $2, $3, 'succeeded', $4, NULL, $5) RETURNING id, occurred_at`,
        [storeId, orderId, method, amount.toString(), auth.userId]
      );
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
        [storeId, order.customer_id, amount.toString(), payment.rows[0].id, note || `Thu nợ đơn ${order.order_number}`, auth.userId]
      );
      await client.query(
        `INSERT INTO cash_movements (store_id, direction, category, amount_vnd, method, source_type, source_id, note, actor_user_id, cash_session_id)
         VALUES ($1, 'in', 'Thu nợ bán hàng', $2, $3, 'order_payment', $4, $5, $6, $7)`,
        [storeId, amount.toString(), method, payment.rows[0].id, note || `Thu đơn ${order.order_number}`, auth.userId, cashSessionId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'order.payment_recorded', 'order', $3, $4, jsonb_build_object('amountVnd', $5::text, 'method', $6::text))`,
        [storeId, auth.userId, orderId, note, amount.toString(), method]
      );
      const body = { payment: { id: payment.rows[0].id, amountVnd: amount.toString(), method, occurredAt: payment.rows[0].occurred_at } };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerPaymentRoutes, amountVnd };
