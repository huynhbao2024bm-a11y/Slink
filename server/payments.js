'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { hasPermission, requirePermission } = require('./rbac');

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

async function openingItemsFor(client, storeId, customerId) {
  const result = await client.query(
    `SELECT e.id, e.note, e.occurred_at, e.created_at, e.debit_vnd::text AS amount_vnd,
            COALESCE((SELECT SUM(p.credit_vnd) FROM customer_ledger_entries p
                      WHERE p.store_id = e.store_id AND p.customer_id = e.customer_id
                        AND p.entry_type = 'payment_credit' AND p.source_type = 'opening_payment'
                        AND p.source_id = e.id), 0)::text AS paid_vnd
     FROM customer_ledger_entries e
     WHERE e.store_id = $1 AND e.customer_id = $2 AND e.entry_type = 'manual_debit' AND e.source_type = 'opening_balance'
     ORDER BY e.occurred_at, e.id`, [storeId, customerId]
  );
  const legacy = await client.query(
    `SELECT credit_vnd::text AS amount_vnd, created_at FROM customer_ledger_entries
     WHERE store_id = $1 AND customer_id = $2 AND entry_type = 'payment_credit' AND source_type = 'customer_payment'
     ORDER BY created_at, id`,
    [storeId, customerId]
  );
  const items = result.rows.map((row) => {
    const unallocated = BigInt(row.amount_vnd) - BigInt(row.paid_vnd);
    if (unallocated < 0n) throw new ApiError(409, 'customer_ledger_mismatch', 'Khoản nợ cũ đã được thu vượt số tiền.');
    return { id: row.id, note: row.note, occurredAt: row.occurred_at,
      createdAt: row.created_at, amountVnd: row.amount_vnd, dueVnd: unallocated.toString() };
  });
  for (const payment of legacy.rows) {
    let remaining = BigInt(payment.amount_vnd);
    for (const item of items) {
      if (new Date(item.createdAt).getTime() > new Date(payment.created_at).getTime()) continue;
      const due = BigInt(item.dueVnd);
      const applied = remaining < due ? remaining : due;
      item.dueVnd = (due - applied).toString();
      remaining -= applied;
      if (!remaining) break;
    }
    if (remaining) throw new ApiError(409, 'customer_ledger_mismatch', 'Khoản thu nợ cũ chưa khớp số mở sổ.');
  }
  return items.filter((item) => BigInt(item.dueVnd) > 0n).map(({ createdAt, ...item }) => item);
}

function registerPaymentRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/customers/:customerId/opening-debts', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn.');
    const amount = amountVnd(request.body?.amountVnd);
    const date = request.body?.date;
    const note = typeof request.body?.note === 'string' ? request.body.note.trim() : '';
    const occurred = typeof date === 'string' ? Date.parse(date + 'T12:00:00+07:00') : NaN;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(occurred) ||
      new Date(occurred).toISOString().slice(0, 10) !== date || note.length < 2 || note.length > 300) {
      throw new ApiError(400, 'validation_error', 'Nhập ngày và ghi chú cho khoản nợ cũ.');
    }
    const value = { customerId, amountVnd: amount.toString(), date, note };
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'record_cashbook', 'Tài khoản này không có quyền mở khoản nợ cũ.');
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`, [storeId, auth.userId, key, digest]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`, [storeId, auth.userId, key]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu đã dùng cho nội dung khác.');
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Khoản nợ đang được xử lý.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }
      const customer = await client.query(`SELECT id FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [storeId, customerId]);
      if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng.');
      const entryId = randomUUID();
      const occurredAt = new Date(occurred).toISOString();
      await client.query(
        `INSERT INTO customer_ledger_entries (id, store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id, occurred_at)
         VALUES ($1, $2, $3, 'manual_debit', $4, 'opening_balance', $1, $5, $6, $7)`,
        [entryId, storeId, customerId, amount.toString(), note, auth.userId, occurredAt]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer.opening_balance_recorded', 'customer', $3, $4,
                 jsonb_build_object('amountVnd', $5::text, 'ledgerEntryId', $6::text, 'date', $7::text))`,
        [storeId, auth.userId, customerId, note, amount.toString(), entryId, date]
      );
      const body = { openingDebt: { id: entryId, amountVnd: amount.toString(), dueVnd: amount.toString(), note, occurredAt } };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`, [storeId, auth.userId, key, JSON.stringify(body)]
      );
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
  app.get('/api/stores/:storeId/customers/:customerId/debts', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!PAYMENT_ROLES.has(membership.role) && !hasPermission(membership, 'record_cashbook')) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem công nợ.');
      }
      const customer = await client.query('SELECT id, name, phone FROM customers WHERE store_id = $1 AND id = $2 AND status = $3', [storeId, customerId, 'active']);
      if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng.');
      const orders = await client.query(
        `SELECT o.id, o.order_number, o.occurred_at, o.total_vnd::text AS total_vnd,
                COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::text AS paid_vnd,
                (o.total_vnd - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)
                 - COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)
                 + COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                             WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0))::text AS due_vnd
         FROM orders o WHERE o.store_id = $1 AND o.customer_id = $2 AND o.status <> 'voided'
         ORDER BY o.occurred_at, o.id`, [storeId, customerId]
      );
      const ledger = await client.query(
        `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd FROM customer_ledger_entries
         WHERE store_id = $1 AND customer_id = $2`, [storeId, customerId]
      );
      const dueOrders = orders.rows.filter((row) => BigInt(row.due_vnd) > 0n);
      const opening = BigInt(ledger.rows[0].balance_vnd) - dueOrders.reduce((sum, row) => sum + BigInt(row.due_vnd), 0n);
      if (opening < 0n && dueOrders.length) throw new ApiError(409, 'customer_ledger_mismatch', 'Sổ công nợ chưa khớp đơn hàng. Hãy kiểm tra lịch sử.');
      const openingItems = await openingItemsFor(client, storeId, customerId);
      if (opening > 0n && openingItems.reduce((sum, item) => sum + BigInt(item.dueVnd), 0n) !== opening) {
        throw new ApiError(409, 'customer_ledger_mismatch', 'Các khoản nợ cũ chưa khớp sổ công nợ.');
      }
      const events = await client.query(
        `SELECT entry_type, debit_vnd::text AS debit_vnd, credit_vnd::text AS credit_vnd,
                source_type, source_id, note, occurred_at
         FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2
         ORDER BY occurred_at DESC, id DESC LIMIT 100`, [storeId, customerId]
      );
      return { customer: customer.rows[0], balanceVnd: ledger.rows[0].balance_vnd,
        openingDueVnd: (opening > 0n ? opening : 0n).toString(),
        customerCreditVnd: (opening < 0n ? -opening : 0n).toString(), orders: dueOrders, openingItems, timeline: events.rows };
    });
  });

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
    const requested = request.body?.allocations;
    if (requested !== undefined && (!Array.isArray(requested) || requested.length < 1 || requested.length > 100)) {
      throw new ApiError(400, 'validation_error', 'Chọn ít nhất một khoản nợ để thu.');
    }
    const selected = requested?.map((item) => {
      const id = item?.orderId;
      if (typeof id !== 'string' || (id !== 'opening' && !UUID_PATTERN.test(id) &&
        !(id.startsWith('opening:') && UUID_PATTERN.test(id.slice(8))))) {
        throw new ApiError(400, 'validation_error', 'Khoản nợ được chọn không hợp lệ.');
      }
      return { orderId: item.orderId, amountVnd: amountVnd(item.amountVnd).toString() };
    });
    if (selected && (new Set(selected.map((item) => item.orderId)).size !== selected.length ||
      selected.reduce((sum, item) => sum + BigInt(item.amountVnd), 0n) !== amount ||
      (selected.some((item) => item.orderId === 'opening') && selected.some((item) => item.orderId.startsWith('opening:'))))) {
      throw new ApiError(400, 'validation_error', 'Tổng tiền phân bổ phải bằng số tiền nhận.');
    }
    const value = { customerId, amountVnd: amount.toString(), method, note, ...(selected ? { allocations: selected } : {}) };
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!PAYMENT_ROLES.has(membership.role) && !hasPermission(membership, 'record_cashbook')) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền ghi nhận thu tiền.');
      }
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
      if (selected && amount > balance) throw new ApiError(409, 'payment_exceeds_due', 'Tiền chọn cho các khoản nợ vượt số còn phải thu.');

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
      if (openingDebt < 0n && orderDebt > 0n) throw new ApiError(409, 'customer_ledger_mismatch', 'Sổ công nợ thấp hơn tổng khoản nợ theo đơn. Hãy kiểm tra lịch sử trước khi thu tiền.');
      const openingItems = await openingItemsFor(client, storeId, customerId);
      if (openingDebt > 0n && openingItems.reduce((sum, item) => sum + BigInt(item.dueVnd), 0n) !== openingDebt) {
        throw new ApiError(409, 'customer_ledger_mismatch', 'Các khoản nợ cũ chưa khớp sổ công nợ.');
      }

      const cashSessionId = method === 'cash' ? await lockActiveCashSession(client, storeId) : null;
      const receiptId = randomUUID();
      let remaining = amount < balance ? amount : balance > 0n ? balance : 0n;
      const advance = amount - remaining;
      const allocations = [];
      const chosenOrders = selected ? selected.filter((item) => item.orderId !== 'opening' && !item.orderId.startsWith('opening:')).map((item) => {
        const order = orderDues.find((row) => row.id === item.orderId);
        if (!order || BigInt(item.amountVnd) > order.due) throw new ApiError(409, 'payment_exceeds_due', 'Khoản thu vượt số còn nợ của đơn đã chọn. Hãy tải lại công nợ.');
        return { ...order, selectedAmount: BigInt(item.amountVnd) };
      }) : orderDues;
      for (const order of chosenOrders) {
        if (!remaining || !order.due) continue;
        const allocated = selected ? order.selectedAmount : remaining < order.due ? remaining : order.due;
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
      const selectedOpening = selected?.filter((item) => item.orderId === 'opening' || item.orderId.startsWith('opening:')) || [];
      if (selected && remaining !== selectedOpening.reduce((sum, item) => sum + BigInt(item.amountVnd), 0n)) {
        throw new ApiError(400, 'validation_error', 'Tiền phân bổ vào khoản nợ cũ không khớp.');
      }
      const openingAllocations = [];
      if (remaining > 0n) {
        if (remaining > openingDebt) throw new ApiError(409, 'customer_ledger_mismatch', 'Khoản thu không thể phân bổ an toàn vào công nợ hiện tại.');
        const picked = selectedOpening.some((item) => item.orderId.startsWith('opening:'))
          ? selectedOpening.map((item) => {
            const opening = openingItems.find((row) => row.id === item.orderId.slice(8));
            if (!opening || BigInt(item.amountVnd) > BigInt(opening.dueVnd)) throw new ApiError(409, 'payment_exceeds_due', 'Khoản thu vượt số còn nợ của khoản đã chọn.');
            return { ...opening, selectedAmount: BigInt(item.amountVnd) };
          }) : openingItems;
        for (const item of picked) {
          if (!remaining) break;
          const allocated = item.selectedAmount || (remaining < BigInt(item.dueVnd) ? remaining : BigInt(item.dueVnd));
          await client.query(
            `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'payment_credit', $3, 'opening_payment', $4, $5, $6)`,
            [storeId, customerId, allocated.toString(), item.id, note || `Thu nợ cũ: ${item.note}`, auth.userId]
          );
          openingAllocations.push({ openingId: item.id, amountVnd: allocated.toString() });
          remaining -= allocated;
        }
        if (remaining) throw new ApiError(409, 'customer_ledger_mismatch', 'Khoản nợ cũ không đủ để phân bổ tiền thu.');
      }
      if (advance > 0n) {
        await client.query(
          `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'payment_credit', $3, 'customer_advance', $4, $5, $6)`,
          [storeId, customerId, advance.toString(), receiptId, note || `Tiền khách trả trước: ${customer.rows[0].name}`, auth.userId]
        );
      }
      await insertCashMovement(client, {
        storeId,
        direction: 'in',
        category: advance === amount ? 'Khách trả trước' : advance > 0n ? 'Thu nợ và trả trước' : 'Thu công nợ khách hàng',
        amountVnd: amount.toString(),
        method,
        sourceType: 'customer_payment',
        sourceId: receiptId,
        note: note || `Thu tiền khách hàng ${customer.rows[0].name}`,
        actorUserId: auth.userId,
        cashSessionId,
        counterpartyKind: 'customer',
        counterpartyId: customerId,
        counterpartyName: customer.rows[0].name,
      });
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer.payment_recorded', 'customer', $3, $4,
                 jsonb_build_object('receiptId', $5::text, 'amountVnd', $6::text, 'method', $7::text,
                                    'openingBalanceAmountVnd', $8::text, 'allocations', $9::jsonb,
                                    'advanceAmountVnd', $10::text))`,
        [storeId, auth.userId, customerId, note, receiptId, amount.toString(), method,
          openingAllocations.reduce((sum, item) => sum + BigInt(item.amountVnd), 0n).toString(), JSON.stringify(allocations), advance.toString()]
      );
      const body = {
        payment: {
          id: receiptId,
          customerId,
          amountVnd: amount.toString(),
          method,
          note,
          customerBalanceVnd: (balance - amount).toString(),
          advanceAmountVnd: advance.toString(),
          allocations,
          openingAllocations,
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
      if (!PAYMENT_ROLES.has(membership.role) && !hasPermission(membership, 'record_cashbook')) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền ghi nhận thu tiền.');
      }
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
      await insertCashMovement(client, {
        storeId,
        direction: 'in',
        category: 'Thu nợ bán hàng',
        amountVnd: amount.toString(),
        method,
        sourceType: 'order_payment',
        sourceId: payment.rows[0].id,
        note: note || `Thu đơn ${order.order_number}`,
        actorUserId: auth.userId,
        cashSessionId,
        counterpartyKind: 'customer',
        counterpartyId: order.customer_id,
      });
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
