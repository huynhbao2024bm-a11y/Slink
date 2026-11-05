'use strict';
const { ApiError } = require('./auth');
const { UUID_PATTERN } = require('./db');

function normalizeOffline(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || !UUID_PATTERN.test(value.deviceId || '')) throw new ApiError(400, 'offline_metadata_invalid', 'Thiếu mã thiết bị cho chứng từ chờ.');
  const occurred = new Date(value.occurredAt);
  if (!Number.isFinite(occurred.getTime()) || occurred.getUTCFullYear() < 2000 || occurred.getTime() > Date.now() + 10 * 60 * 1000) {
    throw new ApiError(409, 'offline_clock_invalid', 'Giờ ghi nhận trên thiết bị chưa đúng. Kiểm tra giờ trước khi xử lý chứng từ chờ.');
  }
  if (value.cashSessionId != null && !UUID_PATTERN.test(value.cashSessionId)) throw new ApiError(400, 'offline_metadata_invalid', 'Ca tiền mặt của chứng từ chờ chưa hợp lệ.');
  const actorUserId = value.actorUserId == null ? null : String(value.actorUserId).toLowerCase();
  if (actorUserId && !UUID_PATTERN.test(actorUserId)) throw new ApiError(400, 'offline_metadata_invalid', 'Tài khoản ghi chứng từ chưa hợp lệ.');
  const expectedCashVnd = value.expectedCashVnd == null ? null : String(value.expectedCashVnd);
  if (expectedCashVnd !== null && !/^(0|[1-9]\d{0,18})$/.test(expectedCashVnd)) throw new ApiError(400, 'offline_metadata_invalid', 'Số tiền đối chiếu ca chưa hợp lệ.');
  return { actorUserId, deviceId: value.deviceId.toLowerCase(), occurredAt: occurred.toISOString(), cashSessionId: value.cashSessionId?.toLowerCase() || null, expectedCashVnd };
}

async function beginOffline(client, metadata) {
  if (!metadata) return;
  if (metadata.actorUserId) {
    const actor = await client.query("SELECT current_setting('app.user_id', true) AS id");
    if (actor.rows[0].id !== metadata.actorUserId) throw new ApiError(403, 'offline_identity_changed', 'Đăng nhập đúng người đã ghi chứng từ này để đồng bộ.');
  }
  await client.query("SELECT set_config('app.offline_occurred_at', $1, true), set_config('app.offline_cash_session_id', $2, true)", [metadata.occurredAt, metadata.cashSessionId || '']);
}

async function recordOffline(client, { storeId, userId, key, kind, entityId, metadata }) {
  if (!metadata) return;
  await client.query(
    `INSERT INTO offline_operation_receipts (store_id, actor_user_id, operation_key, device_id, kind, entity_id, client_occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [storeId, userId, key, metadata.deviceId, kind, entityId, metadata.occurredAt]
  );
}

function expectedPrices(rawItems, metadata) {
  if (!metadata) return null;
  const prices = {};
  for (const item of rawItems || []) {
    const price = String(item.expectedUnitPriceVnd);
    if (!/^(0|[1-9]\d{0,18})$/.test(price)) throw new ApiError(400, 'offline_price_required', 'Thiếu giá đã bán của mặt hàng trong chứng từ chờ.');
    if (prices[item.productId] !== undefined && prices[item.productId] !== price) throw new ApiError(400, 'offline_price_conflict', 'Một mặt hàng có hai giá trong cùng chứng từ.');
    prices[item.productId] = price;
  }
  return prices;
}

module.exports = { normalizeOffline, beginOffline, recordOffline, expectedPrices };
