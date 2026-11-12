'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const STORE_ADMIN_ROLES = new Set(['owner', 'manager']);
const BUSINESS_PROFILES = new Set(['retail', 'online', 'warehouse', 'large_business', 'unsure']);

function storeProfile(input) {
  const source = input || {};
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const phone = typeof source.phone === 'string' ? source.phone.trim() : '';
  const address = typeof source.address === 'string' ? source.address.trim() : '';
  const receiptFooter = typeof source.receiptFooter === 'string' ? source.receiptFooter.trim() : '';
  if (name.length < 2 || name.length > 160) throw new ApiError(400, 'validation_error', 'Tên cửa hàng cần từ 2 đến 160 ký tự.');
  if (phone.length > 40 || address.length > 300 || receiptFooter.length > 240) throw new ApiError(400, 'validation_error', 'Thông tin cửa hàng hoặc lời chào cuối hóa đơn vượt giới hạn.');
  return { name, phone, address, receiptFooter };
}

function registerStoreSettingsRoutes(app, { pool, env }) {
  app.put('/api/stores/:storeId/business-profile', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const profile = typeof request.body?.businessProfile === 'string' ? request.body.businessProfile : '';
    if (!BUSINESS_PROFILES.has(profile)) throw new ApiError(400, 'validation_error', 'Hãy chọn cách sử dụng cửa hàng.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STORE_ADMIN_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới có thể đổi cách sắp xếp cửa hàng.');
      const current = await client.query(
        'SELECT business_profile, onboarding_completed_at FROM stores WHERE id = $1 AND status = \'active\' FOR UPDATE',
        [storeId]
      );
      if (!current.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng đang hoạt động.');
      const changedProfile = current.rows[0].business_profile !== profile || !current.rows[0].onboarding_completed_at;
      if (!changedProfile) return { businessProfile: current.rows[0].business_profile, onboardingCompletedAt: current.rows[0].onboarding_completed_at };
      const changed = await client.query(
        `UPDATE stores
         SET business_profile = $2, onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
             updated_at = CASE WHEN business_profile IS DISTINCT FROM $2 THEN now() ELSE updated_at END
         WHERE id = $1 AND status = 'active'
         RETURNING business_profile, onboarding_completed_at`,
        [storeId, profile]
      );
      if (!changed.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng đang hoạt động.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'store.business_profile_updated', 'store', $1,
                 jsonb_build_object('businessProfile', $3::text))`,
        [storeId, auth.userId, changed.rows[0].business_profile]
      );
      return { businessProfile: changed.rows[0].business_profile, onboardingCompletedAt: changed.rows[0].onboarding_completed_at };
    });
  });

  app.get('/api/stores/:storeId/settings', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client) => {
      const result = await client.query(
        `SELECT id, name, phone, address, receipt_footer, version FROM stores WHERE id = $1 AND status = 'active'`,
        [storeId]
      );
      if (!result.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng đang hoạt động.');
      return { settings: result.rows[0] };
    });
  });

  app.put('/api/stores/:storeId/settings', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const expectedVersion = request.body?.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new ApiError(400, 'validation_error', 'Phiên bản cửa hàng không hợp lệ. Hãy tải lại rồi thử lại.');
    const profile = storeProfile(request.body);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!STORE_ADMIN_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền thay đổi cài đặt cửa hàng.');
      const result = await client.query(
        `UPDATE stores SET name = $3, phone = $4, address = $5, receipt_footer = $6,
             version = version + 1, updated_at = now()
         WHERE id = $1 AND status = 'active' AND version = $2
         RETURNING id, name, phone, address, receipt_footer, version`,
        [storeId, expectedVersion, profile.name, profile.phone, profile.address, profile.receiptFooter]
      );
      if (!result.rowCount) throw new ApiError(409, 'version_conflict', 'Cài đặt đã được thay đổi trên thiết bị khác. Hãy tải lại rồi thử lại.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'store.settings_updated', 'store', $1, jsonb_build_object('version', $3::integer))`,
        [storeId, auth.userId, result.rows[0].version]
      );
      return { settings: result.rows[0] };
    });
  });
}

module.exports = { registerStoreSettingsRoutes, storeProfile };
