'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const EDIT_ROLES = new Set(['owner', 'manager', 'stockkeeper']);
const CHANNEL_CODES = new Set(['shopee', 'lazada', 'tiktok_shop', 'tiki', 'sendo', 'grabmart', 'website', 'other']);
const CHANNEL_NAMES = {
  shopee: 'Shopee', lazada: 'Lazada', tiktok_shop: 'TikTok Shop', tiki: 'Tiki',
  sendo: 'Sendo', grabmart: 'GrabMart', website: 'Website', other: 'Kênh khác',
};

function requireEditor(role) {
  if (!EDIT_ROLES.has(role)) throw new ApiError(403, 'forbidden', 'Vai trò của bạn không được quản lý mã sản phẩm trên kênh bán.');
}

function normalizedText(value, { field, max, optional = false }) {
  const text = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if ((!optional && !text) || text.length > max) {
    throw new ApiError(400, 'validation_error', `${field} ${optional ? `không được dài quá ${max} ký tự` : `cần từ 1 đến ${max} ký tự`}.`);
  }
  return text;
}

function validateProfile(input) {
  const channelCode = input?.channelCode;
  if (typeof channelCode !== 'string' || !CHANNEL_CODES.has(channelCode)) {
    throw new ApiError(400, 'validation_error', 'Hãy chọn kênh bán trong danh sách.');
  }
  return { channelCode, shopLabel: normalizedText(input?.shopLabel, { field: 'Tên gian hàng', max: 120 }) };
}

function validateMapping(input, { requireProduct = true } = {}) {
  const profileId = input?.channelProfileId;
  const productId = input?.productId;
  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) throw new ApiError(400, 'validation_error', 'Gian hàng chưa hợp lệ.');
  if (requireProduct && (typeof productId !== 'string' || !UUID_PATTERN.test(productId))) throw new ApiError(400, 'validation_error', 'Sản phẩm chưa hợp lệ.');
  return {
    channelProfileId: profileId.toLowerCase(),
    ...(requireProduct ? { productId: productId.toLowerCase() } : {}),
    externalSku: normalizedText(input?.externalSku, { field: 'SKU trên kênh', max: 80 }),
    externalProductRef: normalizedText(input?.externalProductRef ?? '', { field: 'Mã mặt hàng trên kênh', max: 120, optional: true }),
  };
}

function getIdempotencyKey(request) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
    throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
  }
  return key;
}

async function reserveRequest(client, storeId, userId, key, payload) {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest();
  const reserved = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, userId, key, hash]
  );
  if (reserved.rowCount) return { replayed: false, hash };
  const previous = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, userId, key]
  );
  const record = previous.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(hash)) {
    throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã được dùng cho dữ liệu khác.');
  }
  if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Thao tác đang được xử lý. Hãy thử lại sau.');
  return { replayed: true, status: record.response_status, body: record.response_body };
}

async function completeRequest(client, storeId, userId, key, status, body) {
  await client.query(
    `UPDATE idempotency_records SET response_status = $4, response_body = $5::jsonb, completed_at = now()
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [storeId, userId, key, status, JSON.stringify(body)]
  );
}

function mapConflict(error) {
  if (error?.code === '23505') {
    if (error.constraint === 'sales_channel_profiles_label_idx') throw new ApiError(409, 'channel_profile_exists', 'Gian hàng này đã được khai báo.');
    if (error.constraint === 'channel_mapping_active_product_idx') throw new ApiError(409, 'channel_product_exists', 'Sản phẩm này đã có mã ánh xạ đang dùng trên gian hàng.');
    if (error.constraint === 'channel_mapping_active_external_sku_idx') throw new ApiError(409, 'channel_sku_exists', 'SKU trên kênh này đã được gắn với sản phẩm khác.');
  }
  throw error;
}

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) throw new ApiError(400, 'validation_error', 'Phiên bản dữ liệu không hợp lệ. Tải lại trang rồi thử lại.');
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'validation_error', 'Phiên bản dữ liệu không hợp lệ. Tải lại trang rồi thử lại.');
  return version;
}

function sendOutcome(reply, outcome) {
  if (outcome.replayed) reply.header('idempotent-replayed', 'true');
  return reply.code(outcome.status).send(outcome.body);
}

function registerChannelMappingRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/channel-catalog', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const rawLimit = request.query?.limit === undefined ? '50' : request.query.limit;
    const rawOffset = request.query?.offset === undefined ? '0' : request.query.offset;
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100
      || typeof rawOffset !== 'string' || !/^\d+$/.test(rawOffset) || Number(rawOffset) > 10000) {
      throw new ApiError(400, 'validation_error', 'Trang danh mục kênh bán không hợp lệ.');
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    const query = typeof request.query?.q === 'string' ? request.query.q.normalize('NFKC').trim().slice(0, 120) : '';
    const state = request.query?.state === 'archived' ? 'archived' : 'active';
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const profiles = await client.query(
        `SELECT p.id, p.channel_code, p.shop_label, p.connection_status, p.status, p.version, p.created_at, p.updated_at,
                COUNT(m.id) FILTER (WHERE m.status = 'active')::int AS active_mapping_count
         FROM sales_channel_profiles p
         LEFT JOIN channel_product_mappings m ON m.store_id = p.store_id AND m.channel_profile_id = p.id
        WHERE p.store_id = $1
         GROUP BY p.id ORDER BY p.created_at, p.id`,
        [storeId]
      );
      const result = await client.query(
        `SELECT m.id, m.channel_profile_id, m.product_id, m.external_sku, m.external_product_ref,
                m.status, m.version, m.created_at, m.updated_at,
                p.channel_code, p.shop_label, p.connection_status,
                pr.sku AS internal_sku, pr.name AS product_name, pr.variant_attributes
         FROM channel_product_mappings m
         JOIN sales_channel_profiles p ON p.store_id = m.store_id AND p.id = m.channel_profile_id
         JOIN products pr ON pr.store_id = m.store_id AND pr.id = m.product_id
         WHERE m.store_id = $1 AND m.status = $2 AND ($6 = 'archived' OR p.status = 'active')
           AND ($3 = '' OR pr.name ILIKE '%' || $3 || '%' OR pr.sku ILIKE '%' || $3 || '%'
             OR m.external_sku ILIKE '%' || $3 || '%' OR p.shop_label ILIKE '%' || $3 || '%')
         ORDER BY p.channel_code, p.shop_label, pr.name, m.id
         LIMIT $4 OFFSET $5`,
        [storeId, state, query, limit + 1, offset, state]
      );
      const hasMore = result.rows.length > limit;
      const mappings = result.rows.slice(0, limit);
      const count = await client.query(
        `SELECT COUNT(*)::int AS total FROM channel_product_mappings m
         JOIN sales_channel_profiles p ON p.store_id = m.store_id AND p.id = m.channel_profile_id
         JOIN products pr ON pr.store_id = m.store_id AND pr.id = m.product_id
         WHERE m.store_id = $1 AND m.status = $2 AND ($4 = 'archived' OR p.status = 'active')
           AND ($3 = '' OR pr.name ILIKE '%' || $3 || '%' OR pr.sku ILIKE '%' || $3 || '%'
             OR m.external_sku ILIKE '%' || $3 || '%' OR p.shop_label ILIKE '%' || $3 || '%')`,
        [storeId, state, query, state]
      );
      return {
        profiles: profiles.rows.map((profile) => ({ ...profile, channel_name: CHANNEL_NAMES[profile.channel_code] || 'Kênh khác' })),
        mappings,
        total: count.rows[0].total,
        nextOffset: hasMore ? offset + limit : null,
        state,
      };
    });
  });

  app.post('/api/stores/:storeId/channel-profiles', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = { operation: 'channel_profile_create', ...validateProfile(request.body) };
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
        if (reservation.replayed) return { ...reservation, body: reservation.body };
        const inserted = await client.query(
          `INSERT INTO sales_channel_profiles (store_id, channel_code, shop_label, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $4)
           RETURNING id, channel_code, shop_label, connection_status, status, version, created_at, updated_at`,
          [storeId, payload.channelCode, payload.shopLabel, auth.userId]
        );
        const profile = { ...inserted.rows[0], channel_name: CHANNEL_NAMES[inserted.rows[0].channel_code] };
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'channel.profile_created', 'sales_channel_profile', $3, $4::jsonb)`,
          [storeId, auth.userId, profile.id, JSON.stringify({ channelCode: profile.channel_code, shopLabel: profile.shop_label, connectionStatus: profile.connection_status })]
        );
        const body = { profile };
        await completeRequest(client, storeId, auth.userId, key, 201, body);
        return { status: 201, body, replayed: false };
      });
    } catch (error) { mapConflict(error); }
    return sendOutcome(reply, outcome);
  });

  app.put('/api/stores/:storeId/channel-profiles/:profileId', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, profileId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(profileId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc gian hàng không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = {
      operation: 'channel_profile_update', profileId,
      ...validateProfile(request.body), expectedVersion: parseVersion(String(request.body?.version ?? '')),
    };
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
        if (reservation.replayed) return { ...reservation, body: reservation.body };
        const locked = await client.query(
          'SELECT id, channel_code, shop_label, status, version FROM sales_channel_profiles WHERE store_id = $1 AND id = $2 FOR UPDATE',
          [storeId, profileId]
        );
        if (!locked.rowCount) throw new ApiError(404, 'channel_profile_not_found', 'Không tìm thấy gian hàng đã lưu.');
        if (locked.rows[0].version !== payload.expectedVersion) throw new ApiError(409, 'stale_version', 'Gian hàng đã được thay đổi ở thiết bị khác. Tải lại rồi thử lại.');
        if (locked.rows[0].status !== 'active') throw new ApiError(409, 'channel_profile_archived', 'Gian hàng đã được lưu trữ.');
        if (locked.rows[0].channel_code !== payload.channelCode) {
          throw new ApiError(409, 'channel_type_immutable', 'Không thể đổi loại sàn của gian hàng đã tạo. Hãy tạo gian hàng mới để giữ nguyên lịch sử mã SKU.');
        }
        const updated = await client.query(
          `UPDATE sales_channel_profiles SET channel_code = $3, shop_label = $4, version = version + 1, updated_by = $5, updated_at = now()
           WHERE store_id = $1 AND id = $2
           RETURNING id, channel_code, shop_label, connection_status, status, version, created_at, updated_at`,
          [storeId, profileId, payload.channelCode, payload.shopLabel, auth.userId]
        );
        const profile = { ...updated.rows[0], channel_name: CHANNEL_NAMES[updated.rows[0].channel_code] };
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'channel.profile_updated', 'sales_channel_profile', $3, $4::jsonb)`,
          [storeId, auth.userId, profileId, JSON.stringify({ channelCode: profile.channel_code, shopLabel: profile.shop_label })]
        );
        const body = { profile };
        await completeRequest(client, storeId, auth.userId, key, 200, body);
        return { status: 200, body, replayed: false };
      });
    } catch (error) { mapConflict(error); }
    return sendOutcome(reply, outcome);
  });

  app.post('/api/stores/:storeId/channel-profiles/:profileId/archive', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, profileId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(profileId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc gian hàng không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = { operation: 'channel_profile_archive', profileId, expectedVersion: parseVersion(String(request.body?.version ?? '')) };
    let outcome;
    outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
      if (reservation.replayed) return { ...reservation, body: reservation.body };
      const locked = await client.query(
        'SELECT id, status, version FROM sales_channel_profiles WHERE store_id = $1 AND id = $2 FOR UPDATE',
        [storeId, profileId]
      );
      if (!locked.rowCount) throw new ApiError(404, 'channel_profile_not_found', 'Không tìm thấy gian hàng đã lưu.');
      if (locked.rows[0].version !== payload.expectedVersion) throw new ApiError(409, 'stale_version', 'Gian hàng đã được thay đổi ở thiết bị khác. Tải lại rồi thử lại.');
      const active = await client.query(
        'SELECT 1 FROM channel_product_mappings WHERE store_id = $1 AND channel_profile_id = $2 AND status = \'active\' LIMIT 1',
        [storeId, profileId]
      );
      if (active.rowCount) throw new ApiError(409, 'active_mappings_exist', 'Hãy lưu trữ các mã sản phẩm đang ánh xạ trước khi lưu trữ gian hàng.');
      if (locked.rows[0].status === 'archived') {
        const body = { archived: true, unchanged: true };
        await completeRequest(client, storeId, auth.userId, key, 200, body);
        return { status: 200, body, replayed: false };
      }
      await client.query(
        `UPDATE sales_channel_profiles SET status = 'archived', version = version + 1, updated_by = $3, updated_at = now()
         WHERE store_id = $1 AND id = $2`,
        [storeId, profileId, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'channel.profile_archived', 'sales_channel_profile', $3, '{}'::jsonb)`,
        [storeId, auth.userId, profileId]
      );
      const body = { archived: true, unchanged: false };
      await completeRequest(client, storeId, auth.userId, key, 200, body);
      return { status: 200, body, replayed: false };
    });
    return sendOutcome(reply, outcome);
  });

  app.post('/api/stores/:storeId/channel-mappings', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = { operation: 'channel_mapping_create', ...validateMapping(request.body) };
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
        if (reservation.replayed) return { ...reservation, body: reservation.body };
        const profile = await client.query(
          'SELECT id, channel_code, shop_label, connection_status FROM sales_channel_profiles WHERE store_id = $1 AND id = $2 AND status = \'active\' FOR UPDATE',
          [storeId, payload.channelProfileId]
        );
        if (!profile.rowCount) throw new ApiError(404, 'channel_profile_not_found', 'Không tìm thấy gian hàng đang hoạt động.');
        const product = await client.query('SELECT id, sku, name FROM products WHERE store_id = $1 AND id = $2 AND status = \'active\' FOR KEY SHARE', [storeId, payload.productId]);
        if (!product.rowCount) throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm đang kinh doanh trong cửa hàng.');
        const inserted = await client.query(
          `INSERT INTO channel_product_mappings (store_id, channel_profile_id, product_id, external_sku, external_product_ref, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           RETURNING id, channel_profile_id, product_id, external_sku, external_product_ref, status, version, created_at, updated_at`,
          [storeId, payload.channelProfileId, payload.productId, payload.externalSku, payload.externalProductRef, auth.userId]
        );
        const mapping = { ...inserted.rows[0], channel_code: profile.rows[0].channel_code, shop_label: profile.rows[0].shop_label, internal_sku: product.rows[0].sku, product_name: product.rows[0].name };
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'channel.mapping_created', 'channel_product_mapping', $3, $4::jsonb)`,
          [storeId, auth.userId, mapping.id, JSON.stringify({ profileId: payload.channelProfileId, productId: payload.productId, externalSku: payload.externalSku })]
        );
        const body = { mapping };
        await completeRequest(client, storeId, auth.userId, key, 201, body);
        return { status: 201, body, replayed: false };
      });
    } catch (error) { mapConflict(error); }
    return sendOutcome(reply, outcome);
  });

  app.put('/api/stores/:storeId/channel-mappings/:mappingId', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, mappingId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(mappingId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc ánh xạ không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = {
      operation: 'channel_mapping_update', mappingId,
      ...validateMapping(request.body, { requireProduct: false }),
      expectedVersion: parseVersion(String(request.body?.version ?? '')),
    };
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireEditor(membership.role);
        const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
        if (reservation.replayed) return { ...reservation, body: reservation.body };
        const locked = await client.query(
          `SELECT m.id, m.channel_profile_id, m.product_id, m.status, m.version, p.channel_code, p.shop_label, pr.sku AS internal_sku, pr.name AS product_name
           FROM channel_product_mappings m
           JOIN sales_channel_profiles p ON p.store_id = m.store_id AND p.id = m.channel_profile_id
           JOIN products pr ON pr.store_id = m.store_id AND pr.id = m.product_id
           WHERE m.store_id = $1 AND m.id = $2 FOR UPDATE OF m`,
          [storeId, mappingId]
        );
        if (!locked.rowCount) throw new ApiError(404, 'channel_mapping_not_found', 'Không tìm thấy ánh xạ sản phẩm.');
        if (locked.rows[0].version !== payload.expectedVersion) throw new ApiError(409, 'stale_version', 'Ánh xạ đã được thay đổi ở thiết bị khác. Tải lại rồi thử lại.');
        if (locked.rows[0].status !== 'active') throw new ApiError(409, 'channel_mapping_archived', 'Ánh xạ này đã được lưu trữ.');
        if (locked.rows[0].channel_profile_id !== payload.channelProfileId) {
          throw new ApiError(409, 'channel_profile_immutable', 'Không thể chuyển ánh xạ sang gian hàng khác. Hãy lưu trữ ánh xạ cũ rồi tạo ánh xạ mới.');
        }
        const updated = await client.query(
          `UPDATE channel_product_mappings SET external_sku = $3, external_product_ref = $4, version = version + 1, updated_by = $5, updated_at = now()
           WHERE store_id = $1 AND id = $2
           RETURNING id, channel_profile_id, product_id, external_sku, external_product_ref, status, version, created_at, updated_at`,
          [storeId, mappingId, payload.externalSku, payload.externalProductRef, auth.userId]
        );
        const mapping = { ...updated.rows[0], ...locked.rows[0] };
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'channel.mapping_updated', 'channel_product_mapping', $3, $4::jsonb)`,
          [storeId, auth.userId, mappingId, JSON.stringify({ externalSku: payload.externalSku, externalProductRef: payload.externalProductRef })]
        );
        const body = { mapping };
        await completeRequest(client, storeId, auth.userId, key, 200, body);
        return { status: 200, body, replayed: false };
      });
    } catch (error) { mapConflict(error); }
    return sendOutcome(reply, outcome);
  });

  app.post('/api/stores/:storeId/channel-mappings/:mappingId/archive', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, mappingId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(mappingId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc ánh xạ không hợp lệ.');
    const key = getIdempotencyKey(request);
    const payload = { operation: 'channel_mapping_archive', mappingId, expectedVersion: parseVersion(String(request.body?.version ?? '')) };
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireEditor(membership.role);
      const reservation = await reserveRequest(client, storeId, auth.userId, key, payload);
      if (reservation.replayed) return { ...reservation, body: reservation.body };
      const locked = await client.query(
        'SELECT id, product_id, channel_profile_id, status, version FROM channel_product_mappings WHERE store_id = $1 AND id = $2 FOR UPDATE',
        [storeId, mappingId]
      );
      if (!locked.rowCount) throw new ApiError(404, 'channel_mapping_not_found', 'Không tìm thấy ánh xạ sản phẩm.');
      if (locked.rows[0].version !== payload.expectedVersion) throw new ApiError(409, 'stale_version', 'Ánh xạ đã được thay đổi ở thiết bị khác. Tải lại rồi thử lại.');
      if (locked.rows[0].status === 'archived') {
        const body = { archived: true, unchanged: true };
        await completeRequest(client, storeId, auth.userId, key, 200, body);
        return { status: 200, body, replayed: false };
      }
      await client.query(
        `UPDATE channel_product_mappings SET status = 'archived', version = version + 1, updated_by = $3, updated_at = now()
         WHERE store_id = $1 AND id = $2`,
        [storeId, mappingId, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'channel.mapping_archived', 'channel_product_mapping', $3, $4::jsonb)`,
        [storeId, auth.userId, mappingId, JSON.stringify({ productId: locked.rows[0].product_id, profileId: locked.rows[0].channel_profile_id })]
      );
      const body = { archived: true, unchanged: false };
      await completeRequest(client, storeId, auth.userId, key, 200, body);
      return { status: 200, body, replayed: false };
    });
    return sendOutcome(reply, outcome);
  });
}

module.exports = { registerChannelMappingRoutes };
