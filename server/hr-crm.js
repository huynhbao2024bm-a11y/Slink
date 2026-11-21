'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { hasPermission, requirePermission } = require('./rbac');

const MAX_BIGINT = 9223372036854775807n;
const METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);

function parsePositiveVnd(value, label = 'Số tiền') {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  const digits = String(text).trim();
  if (!/^[1-9]\d{0,18}$/.test(digits)) {
    throw new ApiError(400, 'validation_error', `${label} phải là số VND nguyên dương.`);
  }
  const parsed = BigInt(digits);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function parseNonNegativeVnd(value, label = 'Số tiền') {
  if (value === undefined || value === null || value === '') return 0n;
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  const digits = String(text).trim();
  if (!/^(0|[1-9]\d{0,18})$/.test(digits)) {
    throw new ApiError(400, 'validation_error', `${label} phải là số VND nguyên không âm.`);
  }
  const parsed = BigInt(digits);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function parseInlineCustomerInput(rawText) {
  const text = typeof rawText === 'string' ? rawText.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (!text) return null;
  const phoneMatch = text.match(/(?:\+?84|0)(?:[\s.-]*\d){6,13}/);
  let phoneNormalized = '';
  let explicitName = '';
  if (phoneMatch) {
    const rawPhone = phoneMatch[0];
    phoneNormalized = rawPhone.replace(/\D/g, '');
    if (phoneNormalized.startsWith('84') && phoneNormalized.length >= 10) {
      phoneNormalized = '0' + phoneNormalized.slice(2);
    }
    explicitName = (text.slice(0, phoneMatch.index) + ' ' + text.slice(phoneMatch.index + rawPhone.length))
      .replace(/^[\s•·,;-]+|[\s•·,;-]+$/g, '')
      .trim();
  } else {
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      phoneNormalized = digitsOnly;
      explicitName = text.replace(/[\d\s+.-]+/g, ' ').trim();
    } else {
      return null;
    }
  }
  if (phoneNormalized.length < 7 || phoneNormalized.length > 15) {
    return null;
  }
  const fallbackName = `Khách ${phoneNormalized.slice(0, 4)}•${phoneNormalized.slice(-3)}`;
  return {
    phoneNormalized,
    phoneDisplay: phoneNormalized,
    explicitName: explicitName.slice(0, 120),
    fallbackName,
  };
}

async function resolveOrCreateInlineCustomer(client, {
  storeId,
  userId,
  customerId,
  customerInline,
  requireExplicitNameForDebt = false,
}) {
  if (customerId) {
    return { customerId, createdInline: false };
  }
  if (!customerInline || typeof customerInline !== 'string' || !customerInline.trim()) {
    return { customerId: null, createdInline: false };
  }
  const parsed = parseInlineCustomerInput(customerInline);
  if (!parsed) {
    throw new ApiError(400, 'validation_error', 'Số điện thoại khách hàng cần từ 7 đến 15 chữ số (VD: 0912345678 Chị Lan).');
  }

  const existingRes = await client.query(
    `SELECT id, name, phone, status
     FROM customers
     WHERE store_id = $1 AND phone_normalized = $2
     ORDER BY (status = 'active') DESC, created_at ASC
     LIMIT 1 FOR UPDATE`,
    [storeId, parsed.phoneNormalized]
  );

  if (existingRes.rowCount) {
    const existing = existingRes.rows[0];
    const shouldUpdateName = Boolean(
      parsed.explicitName
      && (!existing.name || existing.name.startsWith('Khách '))
    );
    if (existing.status !== 'active' || shouldUpdateName) {
      await client.query(
        `UPDATE customers
         SET status = 'active',
             name = CASE WHEN $3::text <> '' THEN $3 ELSE name END,
             version = version + 1,
             updated_at = now()
         WHERE store_id = $1 AND id = $2`,
        [storeId, existing.id, shouldUpdateName ? parsed.explicitName : '']
      );
    }
    return { customerId: existing.id, createdInline: false };
  }

  if (requireExplicitNameForDebt && !parsed.explicitName) {
    throw new ApiError(
      400,
      'customer_name_required_for_debt',
      'Đơn mua nợ cần gõ kèm tên gợi nhớ cạnh SĐT (VD: 0912345678 Chị Lan).'
    );
  }

  const countRes = await client.query(
    `SELECT GREATEST(COUNT(*), COALESCE(MAX(CASE WHEN customer_code ~ '^KH-[0-9]{1,9}$' THEN substring(customer_code FROM 4)::bigint END), 0))::int AS cnt
     FROM customers WHERE store_id = $1`,
    [storeId]
  );
  const customerCode = `KH-${String((countRes.rows[0]?.cnt || 0) + 1).padStart(4, '0')}`;
  const finalName = parsed.explicitName || parsed.fallbackName;

  const createdRes = await client.query(
    `INSERT INTO customers (store_id, customer_code, name, phone, phone_normalized, customer_type, status)
     VALUES ($1, $2, $3, $4, $5, 'retail', 'active')
     RETURNING id, customer_code, name, phone`,
    [storeId, customerCode, finalName, parsed.phoneDisplay, parsed.phoneNormalized]
  );
  const created = createdRes.rows[0];
  await client.query(
    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'customer.inline_created', 'customer', $3, $4::jsonb)`,
    [storeId, userId, created.id, JSON.stringify({ customerCode, name: finalName, phone: parsed.phoneDisplay })]
  );
  return { customerId: created.id, createdInline: true, customer: created };
}

async function getCustomerPointsState(client, storeId, customerId) {
  const res = await client.query(
    `SELECT
       c.id,
       c.name,
       c.phone,
       c.customer_type,
       COALESCE(c.discount_rate_bps, 0)::int AS discount_rate_bps,
       COALESCE(c.bonus_points, 0)::int AS bonus_points,
       COALESCE(s.loyalty_earn_unit_vnd, 100000)::text AS loyalty_earn_unit_vnd,
       COALESCE(s.loyalty_redeem_value_vnd, 1000)::text AS loyalty_redeem_value_vnd,
       COALESCE(s.protect_cost_margin, true) AS protect_cost_margin,
       COALESCE((
         SELECT SUM(pl.points_delta)::int
         FROM customer_point_ledger_entries pl
         WHERE pl.store_id = c.store_id AND pl.customer_id = c.id
       ), 0)::int AS ledger_points_delta,
       COALESCE((
         SELECT SUM(o.total_vnd - COALESCE((
           SELECT SUM(r.refund_total_vnd) FROM returns r
           WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'
         ), 0))
         FROM orders o
         WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'
           AND NOT EXISTS (
             SELECT 1 FROM customer_point_ledger_entries pl2
             WHERE pl2.store_id = o.store_id AND pl2.source_type = 'order' AND pl2.source_id = o.id
           )
       ), 0)::text AS legacy_untracked_spent_vnd
     FROM customers c
     JOIN stores s ON s.id = c.store_id
     WHERE c.store_id = $1 AND c.id = $2`,
    [storeId, customerId]
  );
  if (!res.rowCount) return null;
  const row = res.rows[0];
  const earnUnitVnd = BigInt(row.loyalty_earn_unit_vnd || '100000');
  const redeemValueVnd = BigInt(row.loyalty_redeem_value_vnd || '1000');
  const legacyPoints = earnUnitVnd > 0n ? Number(BigInt(row.legacy_untracked_spent_vnd || '0') / earnUnitVnd) : 0;
  const pointsBalance = Number(row.bonus_points || 0) + legacyPoints + Number(row.ledger_points_delta || 0);
  const redeemablePoints = Math.max(0, pointsBalance);
  return {
    customerId: row.id,
    name: row.name,
    phone: row.phone,
    pointsBalance,
    redeemablePoints,
    earnUnitVnd,
    redeemValueVnd,
    maxRedeemVnd: BigInt(redeemablePoints) * redeemValueVnd,
    protectCostMargin: Boolean(row.protect_cost_margin),
  };
}

async function openingItemsForCustomer(client, storeId, customerId) {
  const result = await client.query(
    `SELECT e.id, e.note, e.occurred_at, e.created_at, e.debit_vnd::text AS amount_vnd,
            COALESCE((SELECT SUM(p.credit_vnd) FROM customer_ledger_entries p
                      WHERE p.store_id = e.store_id AND p.customer_id = e.customer_id
                        AND p.entry_type = 'payment_credit' AND p.source_type = 'opening_payment'
                        AND p.source_id = e.id), 0)::text AS paid_vnd
     FROM customer_ledger_entries e
     WHERE e.store_id = $1 AND e.customer_id = $2 AND e.entry_type = 'manual_debit' AND e.source_type = 'opening_balance'
     ORDER BY e.occurred_at, e.id`,
    [storeId, customerId]
  );
  const legacy = await client.query(
    `SELECT credit_vnd::text AS amount_vnd, created_at FROM customer_ledger_entries
     WHERE store_id = $1 AND customer_id = $2 AND entry_type = 'payment_credit' AND source_type = 'customer_payment'
     ORDER BY created_at, id`,
    [storeId, customerId]
  );
  const items = result.rows.map((row) => {
    const unallocated = BigInt(row.amount_vnd) - BigInt(row.paid_vnd);
    return {
      id: row.id,
      note: row.note,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
      amountVnd: row.amount_vnd,
      dueVnd: (unallocated > 0n ? unallocated : 0n).toString(),
    };
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
  }
  return items.filter((item) => BigInt(item.dueVnd) > 0n);
}

async function settleCustomerPriorDebtFifo(client, {
  storeId,
  customerId,
  customerName,
  amountVnd,
  method,
  actorUserId,
  cashSessionId,
  orderNumber,
  excludeOrderId,
}) {
  if (amountVnd <= 0n) {
    return { settledVnd: 0n, allocations: [], openingAllocations: [] };
  }
  const ordersRes = await client.query(
    `SELECT o.id, o.order_number,
            (o.total_vnd
             - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)
             - COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)
             + COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                         WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0))::text AS due_vnd
     FROM orders o
     WHERE o.store_id = $1 AND o.customer_id = $2 AND o.status <> 'voided'
       AND ($3::uuid IS NULL OR o.id <> $3::uuid)
     ORDER BY o.occurred_at ASC, o.id ASC FOR UPDATE`,
    [storeId, customerId, excludeOrderId || null]
  );

  let remaining = amountVnd;
  const allocations = [];
  for (const row of ordersRes.rows) {
    const due = BigInt(row.due_vnd || '0');
    if (due <= 0n || remaining <= 0n) continue;
    const allocated = remaining < due ? remaining : due;
    const paymentRes = await client.query(
      `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider_reference, recorded_by)
       VALUES ($1, $2, $3, 'succeeded', $4, NULL, $5)
       RETURNING id`,
      [storeId, row.id, method, allocated.toString(), actorUserId]
    );
    await client.query(
      `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
       VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
      [storeId, customerId, allocated.toString(), paymentRes.rows[0].id, `Gộp thu nợ đơn ${row.order_number} (cùng đơn ${orderNumber})`, actorUserId]
    );
    allocations.push({
      orderId: row.id,
      orderNumber: row.order_number,
      paymentId: paymentRes.rows[0].id,
      amountVnd: allocated.toString(),
    });
    remaining -= allocated;
  }

  const openingAllocations = [];
  if (remaining > 0n) {
    const openingItems = await openingItemsForCustomer(client, storeId, customerId);
    for (const item of openingItems) {
      if (remaining <= 0n) break;
      const due = BigInt(item.dueVnd || '0');
      if (due <= 0n) continue;
      const allocated = remaining < due ? remaining : due;
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'payment_credit', $3, 'opening_payment', $4, $5, $6)`,
        [storeId, customerId, allocated.toString(), item.id, `Gộp thu nợ đầu kỳ (cùng đơn ${orderNumber})`, actorUserId]
      );
      openingAllocations.push({ openingId: item.id, amountVnd: allocated.toString() });
      remaining -= allocated;
    }
  }

  const actuallySettled = amountVnd - remaining;
  if (actuallySettled > 0n) {
    const receiptId = randomUUID();
    await insertCashMovement(client, {
      storeId,
      direction: 'in',
      category: 'Thu công nợ khách hàng',
      amountVnd: actuallySettled.toString(),
      method,
      sourceType: 'customer_payment',
      sourceId: receiptId,
      note: `Gộp thu nợ cũ cùng đơn ${orderNumber}`,
      actorUserId,
      cashSessionId: method === 'cash' ? cashSessionId : null,
      counterpartyKind: 'customer',
      counterpartyId: customerId,
      counterpartyName: customerName || '',
    });
    await client.query(
      `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
       VALUES ($1, $2, 'customer.payment_recorded', 'customer', $3, $4,
               jsonb_build_object('receiptId', $5::text, 'amountVnd', $6::text, 'method', $7::text,
                                  'bundledWithOrderNumber', $8::text, 'allocations', $9::jsonb))`,
      [
        storeId,
        actorUserId,
        customerId,
        `Gộp thu nợ cũ cùng đơn ${orderNumber}`,
        receiptId,
        actuallySettled.toString(),
        method,
        orderNumber,
        JSON.stringify(allocations),
      ]
    );
  }
  return { settledVnd: actuallySettled, allocations, openingAllocations };
}

function registerHrCrmRoutes(app, { pool, env }) {
  // 1. Trợ lý Khách Quen 1 Giây trên POS (Tìm theo 4 số cuối SĐT hoặc customerId + Top 3 món hay mua + Điểm + Nợ cũ)
  app.get('/api/stores/:storeId/pos/customer-assistant', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const rawQuery = typeof request.query?.q === 'string' ? request.query.q.trim() : '';
    const requestedCustomerId = typeof request.query?.customerId === 'string' && UUID_PATTERN.test(request.query.customerId)
      ? request.query.customerId
      : null;

    return withStore(pool, auth.userId, storeId, async (client) => {
      let targetCustomer = null;
      let candidates = [];
      let exactTailMatch = false;

      if (requestedCustomerId) {
        const res = await client.query(
          `SELECT id, customer_code, name, phone, phone_normalized, customer_type,
                  COALESCE(discount_rate_bps, 0)::int AS discount_rate_bps,
                  credit_limit_vnd::text AS credit_limit_vnd,
                  COALESCE(bonus_points, 0)::int AS bonus_points
           FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active'`,
          [storeId, requestedCustomerId]
        );
        targetCustomer = res.rows[0] || null;
      } else if (rawQuery) {
        const digits = rawQuery.replace(/\D/g, '');
        const res = await client.query(
          `SELECT id, customer_code, name, phone, phone_normalized, customer_type,
                  COALESCE(discount_rate_bps, 0)::int AS discount_rate_bps,
                  credit_limit_vnd::text AS credit_limit_vnd,
                  COALESCE(bonus_points, 0)::int AS bonus_points
           FROM customers
           WHERE store_id = $1 AND status = 'active'
             AND (
               ($2 <> '' AND COALESCE(phone_normalized, '') LIKE '%' || $2)
               OR ($2 <> '' AND COALESCE(phone_normalized, '') LIKE '%' || $2 || '%')
               OR name ILIKE '%' || $3 || '%'
               OR COALESCE(customer_code, '') ILIKE '%' || $3 || '%'
             )
           ORDER BY
             CASE WHEN $2 <> '' AND COALESCE(phone_normalized, '') = $2 THEN 0
                  WHEN $2 <> '' AND COALESCE(phone_normalized, '') LIKE '%' || $2 THEN 1
                  ELSE 2 END,
             name ASC
           LIMIT 8`,
          [storeId, digits, rawQuery]
        );
        candidates = res.rows;
        if (digits.length >= 4) {
          const tailMatches = candidates.filter((c) => (c.phone_normalized || '').endsWith(digits));
          if (tailMatches.length === 1) {
            targetCustomer = tailMatches[0];
            exactTailMatch = true;
          }
        }
        if (!targetCustomer && candidates.length === 1) {
          targetCustomer = candidates[0];
        }
      }

      if (!targetCustomer) {
        const inlinePreview = parseInlineCustomerInput(rawQuery);
        return {
          matched: false,
          exactTailMatch: false,
          candidates: candidates.map((c) => ({
            id: c.id,
            customerCode: c.customer_code,
            name: c.name,
            phone: c.phone,
            customerType: c.customer_type,
          })),
          inlineNewCustomerPreview: inlinePreview,
        };
      }

      const pointsState = await getCustomerPointsState(client, storeId, targetCustomer.id);
      const debtRes = await client.query(
        `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd
         FROM customer_ledger_entries
         WHERE store_id = $1 AND customer_id = $2`,
        [storeId, targetCustomer.id]
      );
      const balanceVnd = BigInt(debtRes.rows[0]?.balance_vnd || '0');

      const favRes = await client.query(
        `SELECT ol.product_id,
                p.name,
                p.sku,
                p.unit,
                p.sale_price_vnd::text AS sale_price_vnd,
                COUNT(DISTINCT o.id)::int AS order_count,
                SUM(ol.quantity)::text AS total_quantity
         FROM order_lines ol
         JOIN orders o ON o.store_id = ol.store_id AND o.id = ol.order_id
         JOIN products p ON p.store_id = ol.store_id AND p.id = ol.product_id
         WHERE ol.store_id = $1 AND o.customer_id = $2 AND o.status <> 'voided' AND p.status = 'active'
         GROUP BY ol.product_id, p.name, p.sku, p.unit, p.sale_price_vnd
         ORDER BY order_count DESC, SUM(ol.quantity) DESC
         LIMIT 3`,
        [storeId, targetCustomer.id]
      );

      const warrantyRes = await client.query(
        `SELECT COUNT(*)::int AS active_warranty_count
         FROM product_serial_codes sc
         JOIN orders o ON o.store_id = sc.store_id AND o.id = sc.order_id
         WHERE sc.store_id = $1 AND o.customer_id = $2 AND sc.status = 'sold'
           AND sc.warranty_expires_at IS NOT NULL AND sc.warranty_expires_at > now()`,
        [storeId, targetCustomer.id]
      );

      const spentRes = await client.query(
        `SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(o.total_vnd - COALESCE((
                  SELECT SUM(r.refund_total_vnd) FROM returns r
                  WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'
                ), 0)), 0)::text AS total_spent_vnd
         FROM orders o
         WHERE o.store_id = $1 AND o.customer_id = $2 AND o.status <> 'voided'`,
        [storeId, targetCustomer.id]
      );
      const totalSpentVnd = BigInt(spentRes.rows[0]?.total_spent_vnd || '0');
      let loyaltyTier = 'member';
      if (totalSpentVnd >= 50000000n) loyaltyTier = 'diamond';
      else if (totalSpentVnd >= 15000000n || ['vip', 'agency'].includes(targetCustomer.customer_type)) loyaltyTier = 'gold';
      else if (totalSpentVnd >= 3000000n) loyaltyTier = 'silver';

      return {
        matched: true,
        exactTailMatch,
        customer: {
          id: targetCustomer.id,
          customerCode: targetCustomer.customer_code,
          name: targetCustomer.name,
          phone: targetCustomer.phone,
          customerType: targetCustomer.customer_type,
          discountRateBps: targetCustomer.discount_rate_bps,
          creditLimitVnd: targetCustomer.credit_limit_vnd,
          orderCount: Number(spentRes.rows[0]?.order_count || 0),
          totalSpentVnd: totalSpentVnd.toString(),
          loyaltyTier,
        },
        loyalty: {
          pointsBalance: pointsState ? pointsState.pointsBalance : 0,
          redeemablePoints: pointsState ? pointsState.redeemablePoints : 0,
          redeemValueVnd: pointsState ? pointsState.redeemValueVnd.toString() : '1000',
          maxRedeemVnd: pointsState ? pointsState.maxRedeemVnd.toString() : '0',
          earnUnitVnd: pointsState ? pointsState.earnUnitVnd.toString() : '100000',
        },
        debt: {
          balanceVnd: balanceVnd.toString(),
          hasPriorDebt: balanceVnd > 0n,
        },
        favoriteItems: favRes.rows.map((r) => ({
          productId: r.product_id,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          salePriceVnd: r.sale_price_vnd,
          orderCount: r.order_count,
          totalQuantity: r.total_quantity,
        })),
        activeWarrantyCount: Number(warrantyRes.rows[0]?.active_warranty_count || 0),
        candidates: candidates.map((c) => ({
          id: c.id,
          customerCode: c.customer_code,
          name: c.name,
          phone: c.phone,
          customerType: c.customer_type,
        })),
      };
    });
  });

  // 2. Nhật ký In tạm tính F8 (Bắt tận tay hành vi in bill tạm tính thu tiền mặt rồi xóa giỏ / giảm món)
  app.post('/api/stores/:storeId/pos/prebill-events', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};
    const subtotalVnd = parseNonNegativeVnd(body.subtotalVnd ?? 0, 'Tiền hàng tạm tính');
    const expectedTotalVnd = parseNonNegativeVnd(body.expectedTotalVnd ?? subtotalVnd.toString(), 'Tổng tiền tạm tính');
    const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    const lineCount = Math.max(1, Number.parseInt(body.lineCount ?? items.length ?? 1, 10) || 1);
    const customerId = typeof body.customerId === 'string' && UUID_PATTERN.test(body.customerId) ? body.customerId : null;

    return withStore(pool, auth.userId, storeId, async (client) => {
      const res = await client.query(
        `INSERT INTO pos_prebill_events (store_id, actor_user_id, customer_id, subtotal_vnd, expected_total_vnd, line_count, items_snapshot, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'printed')
         RETURNING id, printed_at`,
        [storeId, auth.userId, customerId, subtotalVnd.toString(), expectedTotalVnd.toString(), lineCount, JSON.stringify(items)]
      );
      return reply.code(201).send({
        prebillEvent: {
          id: res.rows[0].id,
          printedAt: res.rows[0].printed_at,
        },
      });
    });
  });

  app.post('/api/stores/:storeId/pos/prebill-events/:prebillId/abandon', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, prebillId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(prebillId)) {
      throw new ApiError(400, 'validation_error', 'Mã phiếu tạm tính không hợp lệ.');
    }
    return withStore(pool, auth.userId, storeId, async (client) => {
      await client.query(
        `UPDATE pos_prebill_events
         SET status = 'abandoned_or_shrunk'
         WHERE store_id = $1 AND id = $2 AND matched_order_id IS NULL`,
        [storeId, prebillId]
      );
      return { status: 'recorded' };
    });
  });

  // 3. Ứng lương nhanh 1 chạm (Gắn cứng employee_user_id vào Sổ quỹ & tự chờ trừ trên Bảng lương cuối tháng)
  app.post('/api/stores/:storeId/staff/:userId/advances', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, userId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(userId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc nhân viên không hợp lệ.');
    }
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn.');
    }
    const amountVnd = parsePositiveVnd(request.body?.amountVnd, 'Số tiền ứng lương');
    const method = request.body?.method || 'bank_transfer';
    if (!METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức chi không hợp lệ.');
    const note = typeof request.body?.note === 'string' ? request.body.note.trim().slice(0, 300) : '';
    const useOpenCashDrawer = Boolean(request.body?.useOpenCashDrawer);
    const digest = createHash('sha256').update(JSON.stringify({ userId, amountVnd: amountVnd.toString(), method, note, useOpenCashDrawer })).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner' && !hasPermission(membership, 'record_cashbook')) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc người có quyền sổ quỹ mới được chi ứng lương.');
      }
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, digest]
      );
      if (!reserved.rowCount) {
        const prev = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = prev.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(digest)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã lưu ứng lương đã được dùng cho dữ liệu khác.');
        }
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const memberRes = await client.query(
        `SELECT m.user_id, m.role, m.staff_code, u.display_name
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.user_id = $2 FOR UPDATE OF m`,
        [storeId, userId]
      );
      if (!memberRes.rowCount) throw new ApiError(404, 'staff_not_found', 'Không tìm thấy nhân viên trong cửa hàng.');
      const member = memberRes.rows[0];

      const cashSessionId = (method === 'cash' && useOpenCashDrawer)
        ? await lockActiveCashSession(client, storeId, { cashOutVnd: amountVnd })
        : null;

      const movement = await insertCashMovement(client, {
        storeId,
        direction: 'out',
        category: 'Tạm ứng lương',
        amountVnd: amountVnd.toString(),
        method,
        sourceType: 'salary_advance',
        sourceId: randomUUID(),
        note: note || `Ứng lương cho ${member.display_name}${member.staff_code ? ` (${member.staff_code})` : ''}`,
        actorUserId: auth.userId,
        cashSessionId,
        counterpartyKind: 'staff',
        counterpartyId: userId,
        counterpartyName: member.display_name,
        includeInPnl: true,
      });

      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'staff.salary_advance_recorded', 'membership', $3, $4, $5::jsonb)`,
        [storeId, auth.userId, userId, note, JSON.stringify({
          movementId: movement.id,
          voucherNumber: movement.voucher_number,
          amountVnd: amountVnd.toString(),
          method,
          employeeName: member.display_name,
        })]
      );

      const body = {
        advance: {
          id: movement.id,
          voucherNumber: movement.voucher_number,
          employeeUserId: userId,
          employeeName: member.display_name,
          amountVnd: amountVnd.toString(),
          method,
          note: note || `Ứng lương cho ${member.display_name}`,
          occurredAt: movement.occurred_at,
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

  // 4. Bỏ qua / Khôi phục khoản lệch thiếu két cuối ca (Owner-only 1 chạm)
  app.post('/api/stores/:storeId/cash-sessions/:sessionId/waive-variance', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, sessionId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(sessionId)) {
      throw new ApiError(400, 'validation_error', 'Phiên ca tiền mặt không hợp lệ.');
    }
    const waived = Boolean(request.body?.waived ?? true);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng mới được miễn trừ khoản lệch két.');
      }
      const res = await client.query(
        `UPDATE cash_register_sessions
         SET variance_waived = $3
         WHERE store_id = $1 AND id = $2 AND settled_payslip_id IS NULL
         RETURNING id, variance_waived`,
        [storeId, sessionId, waived]
      );
      if (!res.rowCount) {
        throw new ApiError(404, 'session_not_found', 'Không tìm thấy ca tiền mặt hoặc ca này đã được chốt vào phiếu lương.');
      }
      return { session: res.rows[0] };
    });
  });

  // 5. Bảng Lương Tự Động 1 Trang (Tự đếm công + Hoa hồng thực thu trừ trả hàng - Ứng lương - Lệch két)
  app.get('/api/stores/:storeId/payroll', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const rawMonth = typeof request.query?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(request.query.month)
      ? request.query.month
      : new Date().toISOString().slice(0, 7);

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng mới được xem bảng lương nhân sự.');
      }

      const periodStart = `${rawMonth}-01T00:00:00.000Z`;
      const [yearNum, monthNum] = rawMonth.split('-').map(Number);
      const nextMonthDate = new Date(Date.UTC(yearNum, monthNum, 1));
      const periodEnd = nextMonthDate.toISOString();

      const membersRes = await client.query(
        `SELECT m.user_id, u.display_name, u.email, m.role, m.status,
                m.staff_code, m.phone, COALESCE(m.job_title, '') AS job_title,
                COALESCE(m.salary_mode, 'monthly') AS salary_mode,
                COALESCE(m.standard_days_per_month, 26)::int AS standard_days_per_month,
                COALESCE(m.base_salary_vnd, 0)::text AS base_salary_vnd,
                COALESCE(m.commission_rate_bps, 0)::int AS commission_rate_bps,
                m.bank_bin, m.bank_account_number, m.bank_account_owner
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.role <> 'owner'
         ORDER BY m.created_at ASC, u.display_name ASC`,
        [storeId]
      );

      const rows = [];
      let totalEstimatedPayableVnd = 0n;

      for (const member of membersRes.rows) {
        // A. Auto-count distinct active workdays and shifts in the month
        const attendanceRes = await client.query(
          `WITH activity_points AS (
             SELECT opened_at AS ts, 1 AS is_shift FROM cash_register_sessions
             WHERE store_id = $1 AND (opened_by = $2 OR closed_by = $2) AND opened_at >= $3::timestamptz AND opened_at < $4::timestamptz
             UNION ALL
             SELECT occurred_at AS ts, 0 AS is_shift FROM orders
             WHERE store_id = $1 AND (cashier_id = $2 OR seller_id = $2) AND status <> 'voided' AND occurred_at >= $3::timestamptz AND occurred_at < $4::timestamptz
             UNION ALL
             SELECT created_at AS ts, 0 AS is_shift FROM inventory_movements
             WHERE store_id = $1 AND actor_user_id = $2 AND created_at >= $3::timestamptz AND created_at < $4::timestamptz
           )
           SELECT
             COUNT(DISTINCT (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS active_days,
             GREATEST(COUNT(DISTINCT (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), SUM(is_shift))::int AS active_shifts,
             MIN(ts) AS first_seen_at,
             MAX(ts) AS last_seen_at
           FROM activity_points`,
          [storeId, member.user_id, periodStart, periodEnd]
        );
        const att = attendanceRes.rows[0] || { active_days: 0, active_shifts: 0 };
        const activeDays = Number(att.active_days || 0);
        const activeShifts = Number(att.active_shifts || 0);
        const autoWorkedUnits = member.salary_mode === 'shift'
          ? activeShifts
          : member.salary_mode === 'hourly'
            ? activeDays * 8
            : (activeDays > 0 ? activeDays : member.standard_days_per_month);

        // B. Net Collected Sales in period (paid amount minus returns/refunds) + cross-period return clawbacks
        const salesRes = await client.query(
          `WITH seller_orders AS (
             SELECT o.id,
                    o.total_vnd,
                    COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::bigint AS paid_vnd,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd,
                    COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                              WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::bigint AS refunded_vnd
             FROM orders o
             WHERE o.store_id = $1
               AND COALESCE(o.seller_id, o.cashier_id) = $2
               AND o.status <> 'voided'
               AND o.occurred_at >= $3::timestamptz AND o.occurred_at < $4::timestamptz
           ), prior_month_returns AS (
             SELECT COALESCE(SUM(r.refund_total_vnd), 0)::bigint AS clawback_sales_vnd
             FROM returns r
             JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
             WHERE r.store_id = $1
               AND r.status = 'completed'
               AND COALESCE(o.seller_id, o.cashier_id) = $2
               AND o.occurred_at < $3::timestamptz
               AND r.created_at >= $3::timestamptz AND r.created_at < $4::timestamptz
           )
           SELECT
             COUNT(*)::int AS orders_count,
             (COALESCE(SUM(GREATEST(0, LEAST(total_vnd - returned_vnd, paid_vnd - refunded_vnd))), 0)::bigint
              - (SELECT clawback_sales_vnd FROM prior_month_returns))::text AS net_collected_sales_vnd,
             (SELECT clawback_sales_vnd::text FROM prior_month_returns) AS prior_month_return_sales_vnd
           FROM seller_orders`,
          [storeId, member.user_id, periodStart, periodEnd]
        );
        const sRow = salesRes.rows[0] || { orders_count: 0, net_collected_sales_vnd: '0', prior_month_return_sales_vnd: '0' };
        const rawNetSalesVnd = BigInt(sRow.net_collected_sales_vnd || '0');
        const netSalesVnd = rawNetSalesVnd > 0n ? rawNetSalesVnd : 0n;
        const commissionRateBps = BigInt(member.commission_rate_bps || 0);
        const commissionPayVnd = (netSalesVnd * commissionRateBps + 5000n) / 10000n;

        // C. Unsettled Salary Advances
        const advancesRes = await client.query(
          `SELECT cm.id, cm.voucher_number, cm.amount_vnd::text AS amount_vnd, cm.method, cm.note, cm.occurred_at
           FROM cash_movements cm
           WHERE cm.store_id = $1 AND cm.counterparty_kind = 'staff' AND cm.counterparty_id = $2 AND cm.direction = 'out'
             AND cm.source_type = 'salary_advance'
             AND NOT EXISTS (
               SELECT 1 FROM staff_payslips sp
               WHERE sp.store_id = cm.store_id AND cm.id = ANY(sp.settled_advance_ids)
             )
           ORDER BY cm.occurred_at DESC`,
          [storeId, member.user_id]
        );
        const advanceDeductionVnd = advancesRes.rows.reduce((sum, r) => sum + BigInt(r.amount_vnd || '0'), 0n);

        // D. Unsettled Cash Register Shortages
        const shortagesRes = await client.query(
          `SELECT id, opened_at, closed_at,
                  (expected_cash_vnd - counted_cash_vnd)::text AS shortage_vnd,
                  variance_waived, close_note AS discrepancy_note
           FROM cash_register_sessions
           WHERE store_id = $1 AND opened_by = $2 AND status = 'closed'
             AND expected_cash_vnd > counted_cash_vnd
             AND settled_payslip_id IS NULL
           ORDER BY closed_at DESC`,
          [storeId, member.user_id]
        );
        const shortageDeductionVnd = shortagesRes.rows
          .filter((r) => !r.variance_waived)
          .reduce((sum, r) => sum + BigInt(r.shortage_vnd || '0'), 0n);

        // E. Base Pay calculation
        const baseSalaryVnd = BigInt(member.base_salary_vnd || '0');
        const stdDays = BigInt(Math.max(1, member.standard_days_per_month || 26));
        let basePayVnd = baseSalaryVnd;
        if (member.salary_mode === 'monthly') {
          basePayVnd = (baseSalaryVnd * BigInt(autoWorkedUnits) + (stdDays / 2n)) / stdDays;
        } else {
          basePayVnd = baseSalaryVnd * BigInt(autoWorkedUnits);
        }

        const grossPayVnd = basePayVnd + commissionPayVnd;
        const netPayableVnd = grossPayVnd > (advanceDeductionVnd + shortageDeductionVnd)
          ? grossPayVnd - advanceDeductionVnd - shortageDeductionVnd
          : 0n;
        totalEstimatedPayableVnd += netPayableVnd;

        const payslipRes = await client.query(
          `SELECT id, payslip_number, period_month, worked_units::text AS worked_units,
                  base_pay_vnd::text AS base_pay_vnd, net_sales_vnd::text AS net_sales_vnd,
                  commission_pay_vnd::text AS commission_pay_vnd, bonus_vnd::text AS bonus_vnd,
                  advance_deduction_vnd::text AS advance_deduction_vnd,
                  shortage_deduction_vnd::text AS shortage_deduction_vnd,
                  net_payable_vnd::text AS net_payable_vnd, payment_method, paid_at
           FROM staff_payslips
           WHERE store_id = $1 AND user_id = $2 AND period_month = $3
           ORDER BY paid_at DESC LIMIT 1`,
          [storeId, member.user_id, rawMonth]
        );

        rows.push({
          userId: member.user_id,
          displayName: member.display_name,
          email: member.email,
          role: member.role,
          status: member.status,
          staffCode: member.staff_code,
          phone: member.phone,
          jobTitle: member.job_title,
          salaryMode: member.salary_mode,
          standardDaysPerMonth: member.standard_days_per_month,
          baseSalaryVnd: member.base_salary_vnd,
          commissionRateBps: member.commission_rate_bps,
          bankBin: member.bank_bin || '',
          bankAccountNumber: member.bank_account_number || '',
          bankAccountOwner: member.bank_account_owner || '',
          activeDays,
          activeShifts,
          autoWorkedUnits,
          firstSeenAt: att.first_seen_at || null,
          lastSeenAt: att.last_seen_at || null,
          ordersCount: Number(sRow.orders_count || 0),
          netSalesVnd: netSalesVnd.toString(),
          priorMonthReturnSalesVnd: sRow.prior_month_return_sales_vnd || '0',
          basePayVnd: basePayVnd.toString(),
          commissionPayVnd: commissionPayVnd.toString(),
          advanceDeductionVnd: advanceDeductionVnd.toString(),
          advances: advancesRes.rows,
          shortageDeductionVnd: shortageDeductionVnd.toString(),
          shortages: shortagesRes.rows,
          netPayableVnd: netPayableVnd.toString(),
          settledPayslip: payslipRes.rows[0] || null,
        });
      }

      return {
        periodMonth: rawMonth,
        totalEstimatedPayableVnd: totalEstimatedPayableVnd.toString(),
        staffPayroll: rows,
      };
    });
  });

  // 6. Chốt & Chi Lương 1 Chạm (Tự tạo phiếu chi Sổ quỹ + P&L + Khóa Tạm ứng & Lệch két + Trả dữ liệu vẽ ảnh PNG Phiếu lương)
  app.post('/api/stores/:storeId/payroll/settle', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu chốt lương an toàn.');
    }
    const body = request.body || {};
    const userId = body.userId;
    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      throw new ApiError(400, 'validation_error', 'Nhân viên không hợp lệ.');
    }
    const periodMonth = typeof body.periodMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.periodMonth)
      ? body.periodMonth
      : new Date().toISOString().slice(0, 7);
    const workedUnits = Number(body.workedUnits ?? 26);
    if (!Number.isFinite(workedUnits) || workedUnits < 0 || workedUnits > 744) {
      throw new ApiError(400, 'validation_error', 'Số công / giờ làm không hợp lệ.');
    }
    const bonusVnd = parseNonNegativeVnd(body.bonusVnd ?? 0, 'Tiền thưởng thêm');
    const includeShortages = body.includeShortages !== false;
    const paymentMethod = body.paymentMethod || 'bank_transfer';
    if (!METHODS.has(paymentMethod)) throw new ApiError(400, 'validation_error', 'Phương thức chi lương không hợp lệ.');
    const useOpenCashDrawer = Boolean(body.useOpenCashDrawer);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    const digest = createHash('sha256').update(JSON.stringify({
      userId, periodMonth, workedUnits, bonusVnd: bonusVnd.toString(), includeShortages, paymentMethod, useOpenCashDrawer, note,
    })).digest();

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng mới được chốt và chi lương nhân sự.');
      }
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, digest]
      );
      if (!reserved.rowCount) {
        const prev = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = prev.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(digest)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã lưu chốt lương đã được dùng cho dữ liệu khác.');
        }
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const memberRes = await client.query(
        `SELECT m.user_id, u.display_name, m.role, m.staff_code, m.phone, COALESCE(m.job_title, '') AS job_title,
                COALESCE(m.salary_mode, 'monthly') AS salary_mode,
                COALESCE(m.standard_days_per_month, 26)::int AS standard_days_per_month,
                COALESCE(m.base_salary_vnd, 0)::text AS base_salary_vnd,
                COALESCE(m.commission_rate_bps, 0)::int AS commission_rate_bps,
                m.bank_bin, m.bank_account_number, m.bank_account_owner
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.user_id = $2 FOR UPDATE OF m`,
        [storeId, userId]
      );
      if (!memberRes.rowCount) throw new ApiError(404, 'staff_not_found', 'Không tìm thấy nhân viên.');
      const member = memberRes.rows[0];

      const periodStart = `${periodMonth}-01T00:00:00.000Z`;
      const [yearNum, monthNum] = periodMonth.split('-').map(Number);
      const periodEnd = new Date(Date.UTC(yearNum, monthNum, 1)).toISOString();

      const salesRes = await client.query(
        `WITH seller_orders AS (
           SELECT o.id,
                  o.total_vnd,
                  COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::bigint AS paid_vnd,
                  COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd,
                  COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                            WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::bigint AS refunded_vnd
           FROM orders o
           WHERE o.store_id = $1
             AND COALESCE(o.seller_id, o.cashier_id) = $2
             AND o.status <> 'voided'
             AND o.occurred_at >= $3::timestamptz AND o.occurred_at < $4::timestamptz
         ), prior_month_returns AS (
           SELECT COALESCE(SUM(r.refund_total_vnd), 0)::bigint AS clawback_sales_vnd
           FROM returns r
           JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
           WHERE r.store_id = $1
             AND r.status = 'completed'
             AND COALESCE(o.seller_id, o.cashier_id) = $2
             AND o.occurred_at < $3::timestamptz
             AND r.created_at >= $3::timestamptz AND r.created_at < $4::timestamptz
         )
         SELECT
           (COALESCE(SUM(GREATEST(0, LEAST(total_vnd - returned_vnd, paid_vnd - refunded_vnd))), 0)::bigint
            - (SELECT clawback_sales_vnd FROM prior_month_returns))::text AS net_collected_sales_vnd
         FROM seller_orders`,
        [storeId, userId, periodStart, periodEnd]
      );
      const rawNetSalesVnd = BigInt(salesRes.rows[0]?.net_collected_sales_vnd || '0');
      const netSalesVnd = rawNetSalesVnd > 0n ? rawNetSalesVnd : 0n;
      const commissionPayVnd = (netSalesVnd * BigInt(member.commission_rate_bps || 0) + 5000n) / 10000n;

      const baseSalaryVnd = BigInt(member.base_salary_vnd || '0');
      const stdDays = BigInt(Math.max(1, member.standard_days_per_month || 26));
      const workedHundredths = BigInt(Math.round(workedUnits * 100));
      let basePayVnd = baseSalaryVnd;
      if (member.salary_mode === 'monthly') {
        basePayVnd = (baseSalaryVnd * workedHundredths + (stdDays * 50n)) / (stdDays * 100n);
      } else {
        basePayVnd = (baseSalaryVnd * workedHundredths + 50n) / 100n;
      }

      // Lock unsettled advances
      const advancesRes = await client.query(
        `SELECT cm.id, cm.amount_vnd::text AS amount_vnd
         FROM cash_movements cm
         WHERE cm.store_id = $1 AND cm.counterparty_kind = 'staff' AND cm.counterparty_id = $2 AND cm.direction = 'out'
           AND cm.source_type = 'salary_advance'
           AND NOT EXISTS (
             SELECT 1 FROM staff_payslips sp
             WHERE sp.store_id = cm.store_id AND cm.id = ANY(sp.settled_advance_ids)
           )
         FOR UPDATE`,
        [storeId, userId]
      );
      const advanceDeductionVnd = advancesRes.rows.reduce((sum, r) => sum + BigInt(r.amount_vnd || '0'), 0n);

      // Lock unsettled shortages
      const shortagesRes = await client.query(
        `SELECT id, (expected_cash_vnd - counted_cash_vnd)::text AS shortage_vnd, variance_waived
         FROM cash_register_sessions
         WHERE store_id = $1 AND opened_by = $2 AND status = 'closed'
           AND expected_cash_vnd > counted_cash_vnd AND settled_payslip_id IS NULL
         FOR UPDATE`,
        [storeId, userId]
      );
      const shortageDeductionVnd = includeShortages
        ? shortagesRes.rows.filter((r) => !r.variance_waived).reduce((sum, r) => sum + BigInt(r.shortage_vnd || '0'), 0n)
        : 0n;

      const grossPayVnd = basePayVnd + commissionPayVnd + bonusVnd;
      const netPayableVnd = grossPayVnd > (advanceDeductionVnd + shortageDeductionVnd)
        ? grossPayVnd - advanceDeductionVnd - shortageDeductionVnd
        : 0n;

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS cnt FROM staff_payslips WHERE store_id = $1 AND period_month = $2`,
        [storeId, periodMonth]
      );
      const payslipNumber = `PL-${periodMonth.replace('-', '')}-${String((countRes.rows[0]?.cnt || 0) + 1).padStart(3, '0')}`;
      const payslipId = randomUUID();

      let cashMovementId = null;
      if (netPayableVnd > 0n) {
        const cashSessionId = (paymentMethod === 'cash' && useOpenCashDrawer)
          ? await lockActiveCashSession(client, storeId, { cashOutVnd: netPayableVnd })
          : null;
        const movement = await insertCashMovement(client, {
          storeId,
          direction: 'out',
          category: 'Chi lương nhân viên',
          amountVnd: netPayableVnd.toString(),
          method: paymentMethod,
          sourceType: 'staff_payslip',
          sourceId: payslipId,
          note: note || `Chi lương kỳ ${periodMonth} cho ${member.display_name} (${payslipNumber})`,
          actorUserId: auth.userId,
          cashSessionId,
          counterpartyKind: 'staff',
          counterpartyId: userId,
          counterpartyName: member.display_name,
          includeInPnl: true,
        });
        cashMovementId = movement.id;
      }

      const settledAdvanceIds = advancesRes.rows.map((r) => r.id);
      const settledShortageSessionIds = shortagesRes.rows.map((r) => r.id);

      const inserted = await client.query(
        `INSERT INTO staff_payslips (
           id, store_id, payslip_number, user_id, period_month, salary_mode_snapshot,
           worked_units, base_pay_vnd, net_sales_vnd, commission_pay_vnd, bonus_vnd,
           advance_deduction_vnd, shortage_deduction_vnd, net_payable_vnd,
           payment_method, cash_movement_id, settled_advance_ids, settled_shortage_session_ids, note, paid_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::uuid[], $18::uuid[], $19, $20)
         RETURNING id, payslip_number, period_month, worked_units::text AS worked_units,
                   base_pay_vnd::text AS base_pay_vnd, net_sales_vnd::text AS net_sales_vnd,
                   commission_pay_vnd::text AS commission_pay_vnd, bonus_vnd::text AS bonus_vnd,
                   advance_deduction_vnd::text AS advance_deduction_vnd,
                   shortage_deduction_vnd::text AS shortage_deduction_vnd,
                   net_payable_vnd::text AS net_payable_vnd, payment_method, cash_movement_id, note, paid_at`,
        [
          payslipId, storeId, payslipNumber, userId, periodMonth, member.salary_mode,
          workedUnits.toFixed(2), basePayVnd.toString(), netSalesVnd.toString(),
          commissionPayVnd.toString(), bonusVnd.toString(), advanceDeductionVnd.toString(),
          shortageDeductionVnd.toString(), netPayableVnd.toString(), paymentMethod,
          cashMovementId, settledAdvanceIds, settledShortageSessionIds, note, auth.userId,
        ]
      );

      if (shortagesRes.rowCount) {
        await client.query(
          `UPDATE cash_register_sessions
           SET settled_payslip_id = $3,
               variance_waived = CASE WHEN $4::boolean = false THEN true ELSE variance_waived END
           WHERE store_id = $1 AND id = ANY($2::uuid[])`,
          [storeId, settledShortageSessionIds, payslipId, includeShortages]
        );
      }

      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'staff.payslip_settled', 'membership', $3, $4, $5::jsonb)`,
        [storeId, auth.userId, userId, note, JSON.stringify({
          payslipId,
          payslipNumber,
          periodMonth,
          netPayableVnd: netPayableVnd.toString(),
          cashMovementId,
        })]
      );

      const body = {
        payslip: {
          ...inserted.rows[0],
          employeeName: member.display_name,
          staffCode: member.staff_code || '',
          jobTitle: member.job_title || '',
          bankBin: member.bank_bin || '',
          bankAccountNumber: member.bank_account_number || '',
          bankAccountOwner: member.bank_account_owner || '',
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

  // 7. Radar Bắt Gian Lận Thực Chiến (In tạm tính F8 rồi xóa giỏ/co ngót + Hoàn tiền mặt + Lệch két)
  app.get('/api/stores/:storeId/loss-prevention-radar', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng mới được xem Radar chống thất thoát.');
      }

      const prebillRes = await client.query(
        `SELECT pb.id, pb.actor_user_id, u.display_name AS actor_name,
                pb.subtotal_vnd::text AS subtotal_vnd,
                pb.expected_total_vnd::text AS expected_total_vnd,
                pb.line_count, pb.items_snapshot, pb.status,
                pb.matched_order_id, o.order_number AS matched_order_number,
                o.total_vnd::text AS matched_order_total_vnd,
                pb.printed_at
         FROM pos_prebill_events pb
         JOIN users u ON u.id = pb.actor_user_id
         LEFT JOIN orders o ON o.store_id = pb.store_id AND o.id = pb.matched_order_id
         WHERE pb.store_id = $1
           AND (
             pb.status = 'abandoned_or_shrunk'
             OR (pb.matched_order_id IS NULL AND pb.printed_at < now() - interval '15 minutes')
             OR (o.id IS NOT NULL AND o.total_vnd * 100 < pb.expected_total_vnd * 85)
           )
         ORDER BY pb.printed_at DESC
         LIMIT 25`,
        [storeId]
      );

      const refundRes = await client.query(
        `SELECT r.id, r.return_number, r.order_id, o.order_number,
                r.refund_total_vnd::text AS refund_total_vnd,
                r.reason, r.created_at,
                u.display_name AS actor_name,
                o.customer_id IS NULL AS walkin_customer
         FROM returns r
         JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
         JOIN users u ON u.id = r.created_by
         WHERE r.store_id = $1 AND r.status = 'completed'
         ORDER BY r.created_at DESC
         LIMIT 20`,
        [storeId]
      );

      const shortageRes = await client.query(
        `SELECT cs.id, cs.opened_by, u.display_name AS actor_name,
                cs.opened_at, cs.closed_at,
                (cs.expected_cash_vnd - cs.counted_cash_vnd)::text AS shortage_vnd,
                cs.variance_waived, cs.settled_payslip_id IS NOT NULL AS settled,
                cs.close_note AS discrepancy_note
         FROM cash_register_sessions cs
         JOIN users u ON u.id = cs.opened_by
         WHERE cs.store_id = $1 AND cs.status = 'closed'
           AND cs.expected_cash_vnd > cs.counted_cash_vnd
         ORDER BY cs.closed_at DESC
         LIMIT 20`,
        [storeId]
      );

      return {
        prebillAlerts: prebillRes.rows.map((r) => ({
          id: r.id,
          actorName: r.actor_name,
          expectedTotalVnd: r.expected_total_vnd,
          matchedOrderNumber: r.matched_order_number || null,
          matchedOrderTotalVnd: r.matched_order_total_vnd || null,
          lineCount: r.line_count,
          items: r.items_snapshot || [],
          status: r.status,
          printedAt: r.printed_at,
          description: r.matched_order_number
            ? `${r.actor_name} in tạm tính ${Number(r.expected_total_vnd).toLocaleString('vi-VN')} ₫ nhưng chốt đơn ${r.matched_order_number} chỉ còn ${Number(r.matched_order_total_vnd || 0).toLocaleString('vi-VN')} ₫`
            : `${r.actor_name} in hóa đơn tạm tính ${Number(r.expected_total_vnd).toLocaleString('vi-VN')} ₫ (${r.line_count} món) nhưng xóa giỏ / chưa thanh toán`,
        })),
        refundAlerts: refundRes.rows.map((r) => ({
          id: r.id,
          returnNumber: r.return_number,
          orderNumber: r.order_number,
          actorName: r.actor_name,
          refundTotalVnd: r.refund_total_vnd,
          reason: r.reason,
          walkinCustomer: r.walkin_customer,
          createdAt: r.created_at,
          description: `${r.actor_name} hoàn trả đơn ${r.order_number} (${Number(r.refund_total_vnd).toLocaleString('vi-VN')} ₫)${r.walkin_customer ? ' — Đơn khách lẻ không có SĐT' : ''}`,
        })),
        shortageAlerts: shortageRes.rows.map((r) => ({
          id: r.id,
          actorName: r.actor_name,
          shortageVnd: r.shortage_vnd,
          waived: r.variance_waived,
          settled: r.settled,
          discrepancyNote: r.discrepancy_note || '',
          closedAt: r.closed_at,
          description: `Ca của ${r.actor_name} đóng két thiếu ${Number(r.shortage_vnd).toLocaleString('vi-VN')} ₫${r.discrepancyNote ? ` (${r.discrepancyNote})` : ''}`,
        })),
      };
    });
  });
}

module.exports = {
  registerHrCrmRoutes,
  parseInlineCustomerInput,
  resolveOrCreateInlineCustomer,
  getCustomerPointsState,
  settleCustomerPriorDebtFifo,
};
