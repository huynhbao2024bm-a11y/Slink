'use strict';

const DEFAULT_CASH_CATEGORIES = [
  ['out', 'Tiền thuê mặt bằng', true],
  ['out', 'Điện, nước & Internet', true],
  ['out', 'Lương & Thưởng nhân viên', true],
  ['out', 'Vận chuyển & Đóng gói', true],
  ['out', 'Quảng cáo & Phí sàn TMĐT', true],
  ['out', 'Chi phí vận hành khác', true],
  ['in', 'Thu nhập khác', true],
  ['in', 'Hoàn lại chi phí', true],
  ['both', 'Góp vốn / Rút vốn', false],
];

function fundTypeForMethod(method) {
  return method === 'cash' ? 'cash' : 'bank';
}

async function allocateVoucherNumber(client, storeId, kind) {
  const column = kind === 'transfer'
    ? 'next_transfer_voucher_number'
    : kind === 'in'
      ? 'next_receipt_voucher_number'
      : 'next_payment_voucher_number';
  const prefix = kind === 'transfer' ? 'CQ' : kind === 'in' ? 'PT' : 'PC';
  const res = await client.query(
    `UPDATE store_sequences
     SET ${column} = ${column} + 1
     WHERE store_id = $1
     RETURNING (${column} - 1)::text AS num`,
    [storeId]
  );
  if (!res.rowCount) {
    throw new Error('Store sequence row is missing for voucher allocation.');
  }
  return `${prefix}-${String(res.rows[0].num).padStart(4, '0')}`;
}

async function ensureDefaultCategories(client, storeId) {
  for (const [direction, name, pnl] of DEFAULT_CASH_CATEGORIES) {
    await client.query(
      `INSERT INTO cash_categories (store_id, direction, name, default_include_in_pnl, is_system)
       SELECT $1, $2, $3, $4, true
       WHERE NOT EXISTS (
         SELECT 1 FROM cash_categories
         WHERE store_id = $1 AND status = 'active' AND lower(trim(name)) = lower($3) AND direction = $2
       )`,
      [storeId, direction, name, pnl]
    );
  }
}

async function insertCashMovement(client, {
  storeId,
  direction,
  category,
  amountVnd,
  method = 'cash',
  sourceType,
  sourceId,
  note = '',
  actorUserId,
  cashSessionId = null,
  occurredAt = null,
  movementKind = 'standard',
  transferGroupId = null,
  reversesMovementId = null,
  categoryId = null,
  includeInPnl = false,
  counterpartyKind = null,
  counterpartyId = null,
  counterpartyName = '',
  voucherNumber = null,
  voidReason = '',
}) {
  const fundType = fundTypeForMethod(method);
  const resolvedVoucher = voucherNumber || await allocateVoucherNumber(
    client,
    storeId,
    movementKind === 'transfer' ? 'transfer' : direction
  );
  const res = await client.query(
    `INSERT INTO cash_movements (
       store_id, direction, category, amount_vnd, method, source_type, source_id,
       note, actor_user_id, cash_session_id, occurred_at,
       voucher_number, fund_type, movement_kind, transfer_group_id, reverses_movement_id,
       category_id, include_in_pnl, counterparty_kind, counterparty_id, counterparty_name, void_reason
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, COALESCE($11::timestamptz, NULLIF(current_setting('app.offline_occurred_at', true), '')::timestamptz, now()),
       $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22
     )
     RETURNING id, voucher_number, fund_type, movement_kind, include_in_pnl, occurred_at`,
    [
      storeId, direction, category, String(amountVnd), method, sourceType, sourceId,
      note, actorUserId, cashSessionId, occurredAt,
      resolvedVoucher, fundType, movementKind, transferGroupId, reversesMovementId,
      categoryId, Boolean(includeInPnl), counterpartyKind, counterpartyId, counterpartyName, voidReason,
    ]
  );
  return res.rows[0];
}

module.exports = {
  DEFAULT_CASH_CATEGORIES,
  fundTypeForMethod,
  allocateVoucherNumber,
  ensureDefaultCategories,
  insertCashMovement,
};
