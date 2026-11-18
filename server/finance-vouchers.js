'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { allocateVoucherNumber, ensureDefaultCategories, insertCashMovement } = require('./cashbook-ledger');

const FINANCE_ROLES = new Set(['owner', 'manager', 'accountant']);
const CASHBOOK_VIEW_ROLES = new Set(['owner', 'manager', 'accountant', 'cashier']);
const BANK_METHODS = new Set(['bank_transfer', 'bank_qr', 'card', 'other']);
const FUNDS = new Set(['all', 'cash', 'bank']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveAmount(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', 'Số tiền không hợp lệ.');
  if (!/^[1-9]\d{0,18}$/.test(String(text))) throw new ApiError(400, 'validation_error', 'Số tiền phải là VND nguyên dương.');
  const parsed = BigInt(text);
  if (parsed > 9223372036854775807n) throw new ApiError(400, 'validation_error', 'Số tiền vượt giới hạn lưu trữ.');
  return parsed;
}

function validateIsoDate(raw, label) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  if (!DATE_PATTERN.test(text)) throw new ApiError(400, 'validation_error', `${label} phải có dạng YYYY-MM-DD.`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  return text;
}

function registerFinanceVoucherRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/finance/categories', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const includeArchived = request.query?.includeArchived === 'true';
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem khoản mục thu chi.');
      }
      const existing = await client.query(`SELECT COUNT(*)::int AS cnt FROM cash_categories WHERE store_id = $1 AND status = 'active'`, [storeId]);
      if (Number(existing.rows[0].cnt) === 0) {
        await ensureDefaultCategories(client, storeId);
      }
      const res = await client.query(
        `SELECT id, direction, name, default_include_in_pnl, is_system, status, created_at
         FROM cash_categories
         WHERE store_id = $1 AND ($2::boolean OR status = 'active')
         ORDER BY status ASC, is_system DESC, direction ASC, name ASC`,
        [storeId, includeArchived]
      );
      return { categories: res.rows };
    });
  });

  app.post('/api/stores/:storeId/finance/categories', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const direction = body.direction || 'out';
    const defaultIncludeInPnl = body.defaultIncludeInPnl !== false;
    if (!name || name.length > 80) throw new ApiError(400, 'validation_error', 'Tên khoản mục từ 1 đến 80 ký tự.');
    if (!['in', 'out', 'both'].includes(direction)) throw new ApiError(400, 'validation_error', 'Loại khoản mục không hợp lệ.');

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán mới được sửa khoản mục thu chi.');
      try {
        const res = await client.query(
          `INSERT INTO cash_categories (store_id, direction, name, default_include_in_pnl, is_system)
           VALUES ($1, $2, $3, $4, false)
           RETURNING id, direction, name, default_include_in_pnl, is_system, status, created_at`,
          [storeId, direction, name, defaultIncludeInPnl]
        );
        return reply.code(201).send({ category: res.rows[0] });
      } catch (err) {
        if (err.code === '23505') throw new ApiError(409, 'category_exists', 'Khoản mục này đã tồn tại.');
        throw err;
      }
    });
  });

  app.patch('/api/stores/:storeId/finance/categories/:categoryId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, categoryId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(categoryId)) throw new ApiError(400, 'validation_error', 'Khoản mục không hợp lệ.');
    const body = request.body || {};
    const hasName = typeof body.name === 'string';
    const nextName = hasName ? body.name.trim() : null;
    if (hasName && (!nextName || nextName.length > 80)) throw new ApiError(400, 'validation_error', 'Tên khoản mục từ 1 đến 80 ký tự.');
    const hasPnl = typeof body.defaultIncludeInPnl === 'boolean';
    const hasStatus = typeof body.status === 'string';
    if (hasStatus && !['active', 'archived'].includes(body.status)) throw new ApiError(400, 'validation_error', 'Trạng thái khoản mục không hợp lệ.');
    if (!hasName && !hasPnl && !hasStatus) throw new ApiError(400, 'validation_error', 'Chưa có thông tin cần cập nhật.');

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền cập nhật khoản mục thu chi.');
      try {
        const currentRes = await client.query(
          `SELECT id, is_system FROM cash_categories WHERE store_id = $1 AND id = $2 FOR UPDATE`,
          [storeId, categoryId]
        );
        if (!currentRes.rowCount) throw new ApiError(404, 'category_not_found', 'Không tìm thấy khoản mục.');
        if (currentRes.rows[0].is_system && (hasName || (hasStatus && body.status === 'archived'))) {
          throw new ApiError(409, 'system_category_locked', 'Không thể đổi tên hoặc ẩn khoản mục mặc định của hệ thống.');
        }
        const res = await client.query(
          `UPDATE cash_categories
           SET name = COALESCE($3, name),
               default_include_in_pnl = COALESCE($4, default_include_in_pnl),
               status = COALESCE($5, status)
           WHERE store_id = $1 AND id = $2
           RETURNING id, direction, name, default_include_in_pnl, is_system, status, created_at`,
          [storeId, categoryId, nextName, hasPnl ? body.defaultIncludeInPnl : null, hasStatus ? body.status : null]
        );
        return { category: res.rows[0] };
      } catch (err) {
        if (err.code === '23505') throw new ApiError(409, 'category_exists', 'Tên khoản mục bị trùng.');
        throw err;
      }
    });
  });

  app.get('/api/stores/:storeId/finance/cashbook', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const q = request.query || {};
    const fund = FUNDS.has(q.fund) ? q.fund : 'all';
    const direction = ['in', 'out'].includes(q.direction) ? q.direction : 'all';
    const kind = ['standard', 'transfer', 'reversal'].includes(q.kind) ? q.kind : 'all';
    const includeInPnl = q.includeInPnl === 'true' ? 'true' : q.includeInPnl === 'false' ? 'false' : 'all';
    const fromDate = validateIsoDate(q.from, 'Ngày bắt đầu');
    const toDate = validateIsoDate(q.to, 'Ngày kết thúc');
    if (fromDate && toDate && fromDate > toDate) throw new ApiError(400, 'validation_error', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    const search = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '';
    const limit = Math.min(Math.max(Number.parseInt(String(q.limit || '50'), 10) || 50, 1), 100);
    const offset = Math.max(Number.parseInt(String(q.offset || '0'), 10) || 0, 0);

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CASHBOOK_VIEW_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem sổ quỹ.');
      }
      const isFull = FINANCE_ROLES.has(membership.role);
      if (!isFull && fund === 'bank') {
        throw new ApiError(403, 'forbidden', 'Thu ngân chỉ được xem sổ tiền mặt của ca làm việc.');
      }
      const effectiveFund = isFull ? fund : 'cash';

      const balRes = await client.query(
        `WITH store_tz AS (SELECT timezone FROM stores WHERE id = $1),
         bounds AS (
           SELECT
             CASE WHEN $2::text IS NOT NULL THEN ($2::date::timestamp AT TIME ZONE timezone) ELSE '-infinity'::timestamptz END AS start_ts,
             CASE WHEN $3::text IS NOT NULL THEN (($3::date + 1)::timestamp AT TIME ZONE timezone) ELSE 'infinity'::timestamptz END AS end_ts
           FROM store_tz
         ),
         scoped AS (
           SELECT c.direction, c.amount_vnd, c.fund_type, c.movement_kind, c.transfer_group_id, c.occurred_at
           FROM cash_movements c
           WHERE c.store_id = $1
             AND ($4::boolean OR c.cash_session_id IN (
               SELECT own.id FROM cash_register_sessions own
               WHERE own.store_id = $1 AND (own.opened_by = $5 OR own.status = 'open')
             ))
         )
         SELECT
           COALESCE(SUM(CASE WHEN s.occurred_at < b.start_ts THEN (CASE WHEN s.direction = 'in' THEN s.amount_vnd ELSE -s.amount_vnd END) ELSE 0 END), 0)::text AS opening_all,
           COALESCE(SUM(CASE WHEN s.occurred_at < b.start_ts AND s.fund_type = 'cash' THEN (CASE WHEN s.direction = 'in' THEN s.amount_vnd ELSE -s.amount_vnd END) ELSE 0 END), 0)::text AS opening_cash,
           COALESCE(SUM(CASE WHEN s.occurred_at < b.start_ts AND s.fund_type = 'bank' THEN (CASE WHEN s.direction = 'in' THEN s.amount_vnd ELSE -s.amount_vnd END) ELSE 0 END), 0)::text AS opening_bank,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.direction = 'in' AND s.transfer_group_id IS NULL THEN s.amount_vnd ELSE 0 END), 0)::text AS in_all,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.direction = 'out' AND s.transfer_group_id IS NULL THEN s.amount_vnd ELSE 0 END), 0)::text AS out_all,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.fund_type = 'cash' AND s.direction = 'in' THEN s.amount_vnd ELSE 0 END), 0)::text AS in_cash,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.fund_type = 'cash' AND s.direction = 'out' THEN s.amount_vnd ELSE 0 END), 0)::text AS out_cash,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.fund_type = 'bank' AND s.direction = 'in' THEN s.amount_vnd ELSE 0 END), 0)::text AS in_bank,
           COALESCE(SUM(CASE WHEN s.occurred_at >= b.start_ts AND s.occurred_at < b.end_ts AND s.fund_type = 'bank' AND s.direction = 'out' THEN s.amount_vnd ELSE 0 END), 0)::text AS out_bank
         FROM scoped s CROSS JOIN bounds b`,
        [storeId, fromDate, toDate, isFull, auth.userId]
      );
      const br = balRes.rows[0];
      const openingCash = BigInt(br.opening_cash);
      const openingAll = isFull ? BigInt(br.opening_all) : openingCash;
      const openingBank = isFull ? BigInt(br.opening_bank) : 0n;
      const inAll = isFull ? BigInt(br.in_all) : BigInt(br.in_cash);
      const outAll = isFull ? BigInt(br.out_all) : BigInt(br.out_cash);
      const inCash = BigInt(br.in_cash);
      const outCash = BigInt(br.out_cash);
      const inBank = isFull ? BigInt(br.in_bank) : 0n;
      const outBank = isFull ? BigInt(br.out_bank) : 0n;

      const listRes = await client.query(
        `WITH store_tz AS (SELECT timezone FROM stores WHERE id = $1),
         bounds AS (
           SELECT
             CASE WHEN $2::text IS NOT NULL THEN ($2::date::timestamp AT TIME ZONE timezone) ELSE '-infinity'::timestamptz END AS start_ts,
             CASE WHEN $3::text IS NOT NULL THEN (($3::date + 1)::timestamp AT TIME ZONE timezone) ELSE 'infinity'::timestamptz END AS end_ts
           FROM store_tz
         )
         SELECT c.id AS movement_id, c.voucher_number, c.direction, c.category, c.amount_vnd::text AS amount_vnd,
                c.method, c.fund_type, c.movement_kind, c.transfer_group_id, c.reverses_movement_id,
                c.include_in_pnl, c.source_type, c.source_id, c.cash_session_id,
                c.counterparty_kind, c.counterparty_id, c.counterparty_name, c.void_reason,
                s.opened_at AS cash_session_opened_at,
                c.note, c.occurred_at, u.display_name AS actor_name, o.id AS order_id, o.order_number,
                rev.id AS reversed_by_movement_id,
                COALESCE(
                  CASE WHEN NULLIF(c.counterparty_name, '') IS NOT NULL
                    THEN jsonb_build_object('kind', COALESCE(c.counterparty_kind, 'other'), 'id', c.counterparty_id, 'name', c.counterparty_name)
                  END,
                  a.metadata->'counterparty'
                ) AS counterparty,
                COUNT(*) OVER()::int AS total_count
         FROM cash_movements c
         CROSS JOIN bounds b
         JOIN users u ON u.id = c.actor_user_id
         LEFT JOIN cash_register_sessions s ON s.store_id = c.store_id AND s.id = c.cash_session_id
         LEFT JOIN payments p ON p.store_id = c.store_id AND p.id = c.source_id AND c.source_type = 'order_payment'
         LEFT JOIN orders o ON o.store_id = c.store_id AND o.id = COALESCE(p.order_id, c.source_id)
           AND c.source_type IN ('order_payment', 'order_change')
         LEFT JOIN cash_movements rev ON rev.store_id = c.store_id AND rev.reverses_movement_id = c.id
         LEFT JOIN LATERAL (
           SELECT metadata FROM audit_events a WHERE $4::boolean AND c.source_type = 'manual_cash_movement'
             AND a.store_id = c.store_id AND a.entity_id = c.source_id AND a.entity_type = 'cash_movement' AND a.action = 'cash_movement.created'
           ORDER BY a.occurred_at DESC LIMIT 1
         ) a ON true
         WHERE c.store_id = $1
           AND c.occurred_at >= b.start_ts AND c.occurred_at < b.end_ts
           AND ($4::boolean OR c.cash_session_id IN (
             SELECT own.id FROM cash_register_sessions own
             WHERE own.store_id = $1 AND (own.opened_by = $5 OR own.status = 'open')
           ))
           AND ($6::text = 'all' OR c.fund_type = $6)
           AND ($7::text = 'all' OR c.direction = $7)
           AND ($8::text = 'all' OR c.movement_kind = $8)
           AND ($9::text = 'all' OR c.include_in_pnl = ($9 = 'true'))
           AND ($10::text = '' OR c.voucher_number ILIKE '%' || $10 || '%' OR c.category ILIKE '%' || $10 || '%' OR c.note ILIKE '%' || $10 || '%' OR c.counterparty_name ILIKE '%' || $10 || '%')
         ORDER BY c.occurred_at DESC, c.created_at DESC, c.id DESC
         LIMIT $11 OFFSET $12`,
        [storeId, fromDate, toDate, isFull, auth.userId, effectiveFund, direction, kind, includeInPnl, search, limit, offset]
      );
      const total = Number(listRes.rows[0]?.total_count || 0);
      return {
        balances: {
          all: { openingVnd: openingAll.toString(), inVnd: inAll.toString(), outVnd: outAll.toString(), closingVnd: (openingAll + inAll - outAll).toString() },
          cash: { openingVnd: openingCash.toString(), inVnd: inCash.toString(), outVnd: outCash.toString(), closingVnd: (openingCash + inCash - outCash).toString() },
          bank: isFull
            ? { openingVnd: openingBank.toString(), inVnd: inBank.toString(), outVnd: outBank.toString(), closingVnd: (openingBank + inBank - outBank).toString() }
            : null,
        },
        filteredSummary: {
          fund: effectiveFund,
          inVnd: (effectiveFund === 'cash' ? inCash : effectiveFund === 'bank' ? inBank : inAll).toString(),
          outVnd: (effectiveFund === 'cash' ? outCash : effectiveFund === 'bank' ? outBank : outAll).toString(),
        },
        movements: listRes.rows,
        total,
        nextOffset: offset + listRes.rows.length < total ? offset + listRes.rows.length : null,
      };
    });
  });

  app.post('/api/stores/:storeId/cash-transfers', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu phiếu chuyển quỹ an toàn.');
    }
    const body = request.body || {};
    const fromFund = body.fromFund;
    const toFund = body.toFund;
    if (!['cash', 'bank'].includes(fromFund) || !['cash', 'bank'].includes(toFund) || fromFund === toFund) {
      throw new ApiError(400, 'validation_error', 'Chọn đúng chiều chuyển quỹ giữa Tiền mặt và Ngân hàng.');
    }
    const amount = parsePositiveAmount(body.amountVnd);
    const bankMethod = body.bankMethod || 'bank_transfer';
    if (!BANK_METHODS.has(bankMethod)) throw new ApiError(400, 'validation_error', 'Phương thức ngân hàng không hợp lệ.');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 300) throw new ApiError(400, 'validation_error', 'Ghi chú tối đa 300 ký tự.');

    const value = { fromFund, toFund, amountVnd: amount.toString(), bankMethod, note };
    const digest = createHash('sha256').update(JSON.stringify(value)).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền chuyển quỹ nội bộ.');
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
        const rec = previous.rows[0];
        if (!rec || !Buffer.from(rec.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu chuyển quỹ đã được dùng cho dữ liệu khác.');
        if (!rec.response_body || !rec.response_status) throw new ApiError(409, 'request_in_progress', 'Giao dịch chuyển quỹ đang được xử lý.');
        return { status: rec.response_status, body: rec.response_body, replayed: true };
      }

      const cashSessionId = await lockActiveCashSession(client, storeId, { cashOutVnd: fromFund === 'cash' ? amount : 0n });
      const transferGroupId = randomUUID();
      const voucherNumber = await allocateVoucherNumber(client, storeId, 'transfer');
      const label = fromFund === 'cash' ? 'Nộp tiền mặt vào ngân hàng' : 'Rút tiền ngân hàng nhập két';
      const resolvedNote = note || label;

      const outRow = await insertCashMovement(client, {
        storeId,
        direction: 'out',
        category: 'Chuyển quỹ nội bộ',
        amountVnd: amount.toString(),
        method: fromFund === 'cash' ? 'cash' : bankMethod,
        sourceType: 'internal_transfer',
        sourceId: transferGroupId,
        note: resolvedNote,
        actorUserId: auth.userId,
        cashSessionId: fromFund === 'cash' ? cashSessionId : null,
        movementKind: 'transfer',
        transferGroupId,
        includeInPnl: false,
        voucherNumber,
      });
      const inRow = await insertCashMovement(client, {
        storeId,
        direction: 'in',
        category: 'Chuyển quỹ nội bộ',
        amountVnd: amount.toString(),
        method: toFund === 'cash' ? 'cash' : bankMethod,
        sourceType: 'internal_transfer',
        sourceId: transferGroupId,
        note: resolvedNote,
        actorUserId: auth.userId,
        cashSessionId: toFund === 'cash' ? cashSessionId : null,
        movementKind: 'transfer',
        transferGroupId,
        includeInPnl: false,
        voucherNumber,
      });
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'cash_transfer.created', 'cash_transfer', $3, $4,
                 jsonb_build_object('voucherNumber', $5::text, 'fromFund', $6::text, 'toFund', $7::text, 'amountVnd', $8::text))`,
        [storeId, auth.userId, transferGroupId, resolvedNote, voucherNumber, fromFund, toFund, amount.toString()]
      );
      const bodyResult = {
        transfer: {
          id: transferGroupId,
          voucherNumber,
          fromFund,
          toFund,
          amountVnd: amount.toString(),
          note: resolvedNote,
          movements: [outRow.id, inRow.id],
          occurredAt: inRow.occurred_at,
        },
      };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(bodyResult)]
      );
      return { status: 201, body: bodyResult, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/cash-movements/:movementId/void', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, movementId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(movementId)) throw new ApiError(400, 'validation_error', 'Phiếu thu chi không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn khi hủy phiếu.');
    }
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length < 2 || reason.length > 300) {
      throw new ApiError(400, 'validation_error', 'Nhập lý do hủy / đảo phiếu từ 2 đến 300 ký tự.');
    }
    const digest = createHash('sha256').update(JSON.stringify({ movementId: movementId.toLowerCase(), reason })).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền hủy / đảo phiếu thu chi.');
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
        const rec = previous.rows[0];
        if (!rec || !Buffer.from(rec.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu thao tác đã được dùng cho dữ liệu khác.');
        if (!rec.response_body || !rec.response_status) throw new ApiError(409, 'request_in_progress', 'Yêu cầu hủy phiếu đang được xử lý.');
        return { status: rec.response_status, body: rec.response_body, replayed: true };
      }

      const targetRes = await client.query(
        `SELECT id, voucher_number, direction, category, amount_vnd::text AS amount_vnd, method,
                source_type, source_id, transfer_group_id, movement_kind, include_in_pnl,
                category_id, counterparty_kind, counterparty_id, counterparty_name
         FROM cash_movements WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, movementId]
      );
      if (!targetRes.rowCount) throw new ApiError(404, 'movement_not_found', 'Không tìm thấy phiếu thu chi.');
      const target = targetRes.rows[0];
      if (!['manual_cash_movement', 'internal_transfer'].includes(target.source_type)) {
        throw new ApiError(409, 'cannot_void_linked_movement', 'Phiếu này gắn với đơn hàng hoặc chứng từ kho. Hãy hủy hoặc trả hàng từ chứng từ gốc.');
      }
      if (target.movement_kind === 'reversal') {
        throw new ApiError(409, 'already_reversed', 'Không thể hủy một bút toán đã đảo.');
      }

      const legs = target.source_type === 'internal_transfer' && target.transfer_group_id
        ? (await client.query(
          `SELECT id, voucher_number, direction, category, amount_vnd::text AS amount_vnd, method,
                  source_type, source_id, transfer_group_id, movement_kind, include_in_pnl,
                  category_id, counterparty_kind, counterparty_id, counterparty_name
           FROM cash_movements
           WHERE store_id = $1 AND transfer_group_id = $2 AND movement_kind = 'transfer'
           ORDER BY direction, id FOR UPDATE`,
          [storeId, target.transfer_group_id]
        )).rows
        : [target];

      const dupCheck = await client.query(
        `SELECT 1 FROM cash_movements WHERE store_id = $1 AND reverses_movement_id = ANY($2::uuid[]) LIMIT 1`,
        [storeId, legs.map((l) => l.id)]
      );
      if (dupCheck.rowCount) {
        throw new ApiError(409, 'already_reversed', 'Phiếu thu chi này đã được hủy / đảo trước đó.');
      }

      let cashSessionId = null;
      let cashOutNeeded = 0n;
      let touchesCash = false;
      for (const leg of legs) {
        if (leg.method === 'cash') {
          touchesCash = true;
          if (leg.direction === 'in') cashOutNeeded += BigInt(leg.amount_vnd);
        }
      }
      if (touchesCash) {
        cashSessionId = await lockActiveCashSession(client, storeId, { cashOutVnd: cashOutNeeded });
      }

      const reversals = [];
      for (const leg of legs) {
        const flippedDirection = leg.direction === 'in' ? 'out' : 'in';
        const voucherNum = `HUY-${leg.voucher_number || leg.id.slice(0, 6).toUpperCase()}`;
        const revRow = await insertCashMovement(client, {
          storeId,
          direction: flippedDirection,
          category: leg.category,
          amountVnd: leg.amount_vnd,
          method: leg.method,
          sourceType: 'cash_movement_reversal',
          sourceId: leg.id,
          note: `Đảo ${leg.voucher_number || 'phiếu'}: ${reason}`,
          actorUserId: auth.userId,
          cashSessionId: leg.method === 'cash' ? cashSessionId : null,
          movementKind: 'reversal',
          transferGroupId: leg.transfer_group_id,
          reversesMovementId: leg.id,
          categoryId: leg.category_id,
          includeInPnl: leg.include_in_pnl,
          counterpartyKind: leg.counterparty_kind,
          counterpartyId: leg.counterparty_id,
          counterpartyName: leg.counterparty_name || '',
          voucherNumber: voucherNum,
          voidReason: reason,
        });
        reversals.push(revRow);
      }

      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'cash_movement.reversed', 'cash_movement', $3, $4,
                 jsonb_build_object('originalVoucher', $5::text, 'reversalIds', $6::jsonb))`,
        [storeId, auth.userId, target.id, reason, target.voucher_number, JSON.stringify(reversals.map((r) => r.id))]
      );

      const bodyResult = {
        reversedMovementId: target.id,
        reversals: reversals.map((r) => ({ id: r.id, voucherNumber: r.voucher_number })),
      };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(bodyResult)]
      );
      return { status: 201, body: bodyResult, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.get('/api/stores/:storeId/finance/payables', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const q = typeof request.query?.q === 'string' ? request.query.q.trim().slice(0, 80) : '';
    const onlyOwing = request.query?.onlyOwing === 'true';
    const limit = Math.min(Math.max(Number.parseInt(String(request.query?.limit || '50'), 10) || 50, 1), 100);
    const offset = Math.max(Number.parseInt(String(request.query?.offset || '0'), 10) || 0, 0);

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!FINANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán mới được xem công nợ nhà cung cấp.');
      }
      const res = await client.query(
        `WITH all_balances AS (
           SELECT s.id, s.name,
                  COALESCE(SUM(l.increases_payable_vnd) - SUM(l.decreases_payable_vnd), 0)::bigint AS balance_vnd,
                  MAX(l.occurred_at) AS last_activity_at,
                  COUNT(DISTINCT l.id) FILTER (WHERE l.source_type = 'purchase')::int AS purchase_count
           FROM suppliers s
           LEFT JOIN supplier_ledger_entries l ON l.store_id = s.store_id AND l.supplier_id = s.id
           WHERE s.store_id = $1 AND s.status = 'active'
           GROUP BY s.id, s.name
         ),
         filtered AS (
           SELECT *, COUNT(*) OVER()::int AS total_count
           FROM all_balances
           WHERE ($2::text = '' OR name ILIKE '%' || $2 || '%')
             AND (NOT $3::boolean OR balance_vnd > 0)
           ORDER BY balance_vnd DESC, name ASC
           LIMIT $4 OFFSET $5
         ),
         total_summary AS (
           SELECT COALESCE(SUM(balance_vnd) FILTER (WHERE balance_vnd > 0), 0)::text AS total_payable_vnd
           FROM all_balances
         )
         SELECT f.id, f.name, f.balance_vnd::text AS balance_vnd, f.last_activity_at, f.purchase_count, f.total_count,
                t.total_payable_vnd
         FROM total_summary t
         LEFT JOIN filtered f ON true`,
        [storeId, q, onlyOwing, limit, offset]
      );
      const dataRows = res.rows.filter((r) => r.id != null);
      const total = Number(dataRows[0]?.total_count || 0);
      return {
        suppliers: dataRows.map((r) => ({
          id: r.id,
          name: r.name,
          balanceVnd: r.balance_vnd,
          lastActivityAt: r.last_activity_at,
          purchaseCount: r.purchase_count,
        })),
        total,
        totalPayableVnd: res.rows[0]?.total_payable_vnd || '0',
        nextOffset: offset + dataRows.length < total ? offset + dataRows.length : null,
      };
    });
  });
}

module.exports = { registerFinanceVoucherRoutes };
