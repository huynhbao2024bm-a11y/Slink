'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const EDIT_CUSTOMER_ROLES = new Set(['owner', 'manager', 'cashier']);
const CREATE_CUSTOMER_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const CUSTOMER_IMPORT_ROLES = new Set(['owner', 'manager', 'accountant']);
const CUSTOMER_VIEW_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const CUSTOMER_SEGMENT_MANAGE_ROLES = new Set(['owner', 'manager', 'accountant']);
const ORDER_VIEW_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const ORDER_COLLABORATE_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const OPENING_BALANCE_ROLES = new Set(['owner', 'manager', 'accountant']);
const VOID_ORDER_ROLES = new Set(['owner', 'manager']);
const MAX_BIGINT = 9223372036854775807n;
const MAX_CUSTOMER_IMPORT_ROWS = 200;
const CUSTOMER_SEGMENTS = new Set(['no_purchase', 'repeat', 'owing', 'inactive90']);

function nonNegativeVnd(value, label) {
  if (value === undefined || value === null || value === '') return 0n;
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(text)) {
    throw new ApiError(400, 'validation_error', `${label} phải là VND nguyên không âm.`);
  }
  const amount = BigInt(text);
  if (amount > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return amount;
}

function validateCustomer(input, { partial = false } = {}) {
  const source = input || {};
  const values = {};
  if (!partial || source.name !== undefined) {
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (name.length < 1 || name.length > 160) throw new ApiError(400, 'validation_error', 'Tên khách hàng cần từ 1 đến 160 ký tự.');
    values.name = name;
  }
  if (!partial || source.phone !== undefined) {
    const phone = source.phone == null ? '' : String(source.phone).trim();
    const normalized = phone.replace(/\D/g, '');
    if (phone && (normalized.length < 7 || normalized.length > 15)) throw new ApiError(400, 'validation_error', 'Số điện thoại cần có từ 7 đến 15 chữ số.');
    values.phone = phone || null;
    values.phoneNormalized = normalized || null;
  }
  if (!partial || source.email !== undefined) {
    const email = source.email == null ? '' : String(source.email).trim();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new ApiError(400, 'validation_error', 'Email khách hàng không hợp lệ.');
    values.email = email || null;
  }
  if (!partial || source.note !== undefined) {
    const note = typeof source.note === 'string' ? source.note.trim() : '';
    if (note.length > 1000) throw new ApiError(400, 'validation_error', 'Ghi chú tối đa 1.000 ký tự.');
    values.note = note;
  }
  return values;
}

function validateCustomerImportRows(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_CUSTOMER_IMPORT_ROWS) {
    throw new ApiError(400, 'validation_error', `Tệp cần có từ 1 đến ${MAX_CUSTOMER_IMPORT_ROWS} khách hàng.`);
  }
  const rows = input.map((raw, index) => {
    if (raw?.sourceLine !== undefined && (!Number.isSafeInteger(raw.sourceLine) || raw.sourceLine < 2 || raw.sourceLine > 1_000_000)) {
      throw new ApiError(400, 'validation_error', `Dòng ${index + 2}: số dòng nguồn không hợp lệ.`);
    }
    const sourceLine = raw?.sourceLine ?? index + 2;
    const customer = validateCustomer(raw);
    const openingBalance = nonNegativeVnd(raw?.openingBalanceVnd, `Dòng ${sourceLine}: công nợ ban đầu`);
    return { sourceLine, customer, openingBalanceVnd: openingBalance.toString() };
  });
  const seenPhones = new Map();
  const seenEmails = new Map();
  for (const row of rows) {
    for (const [value, seen, label] of [
      [row.customer.phoneNormalized, seenPhones, 'số điện thoại'],
      [row.customer.email?.toLocaleLowerCase('vi-VN') || null, seenEmails, 'email'],
    ]) {
      if (!value) continue;
      if (seen.has(value)) {
        throw new ApiError(400, 'customer_import_duplicate', `Dòng ${row.sourceLine}: ${label} trùng với dòng ${seen.get(value)} trong tệp. Hãy kiểm tra trước khi nhập.`);
      }
      seen.set(value, row.sourceLine);
    }
  }
  return rows;
}

function describeCustomerImportConflict(rows, existingRows) {
  const phones = new Set(existingRows.map((row) => row.phone_normalized).filter(Boolean));
  const emails = new Set(existingRows.map((row) => row.email_normalized).filter(Boolean));
  const conflicting = rows.find((row) => (row.customer.phoneNormalized && phones.has(row.customer.phoneNormalized))
    || (row.customer.email && emails.has(row.customer.email.toLocaleLowerCase('vi-VN'))));
  return conflicting
    ? `Dòng ${conflicting.sourceLine}: số điện thoại hoặc email đã có trong một hồ sơ khách hàng đang hoạt động. Không có dòng nào được nhập.`
    : null;
}

async function findCustomerImportConflicts(client, storeId, rows) {
  const phones = rows.map((row) => row.customer.phoneNormalized).filter(Boolean);
  const emails = rows.map((row) => row.customer.email?.toLocaleLowerCase('vi-VN')).filter(Boolean);
  return client.query(
    `SELECT phone_normalized, lower(email) AS email_normalized
     FROM customers
     WHERE store_id = $1 AND status = 'active'
       AND ((cardinality($2::text[]) > 0 AND phone_normalized = ANY($2::text[]))
         OR (cardinality($3::text[]) > 0 AND lower(email) = ANY($3::text[])))`,
    [storeId, phones, emails]
  );
}

function pageArgs(query) {
  const limit = Math.min(Math.max(Number.parseInt(query?.limit || '50', 10) || 50, 1), 100);
  const offset = Math.min(Math.max(Number.parseInt(query?.offset || '0', 10) || 0, 0), 10000);
  const search = typeof query?.q === 'string' ? query.q.trim().slice(0, 120) : '';
  return { limit, offset, search };
}

function orderTag(value) {
  const tag = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (!tag || Array.from(tag).length > 32 || !/^[\p{L}\p{N} _-]+$/u.test(tag)) {
    throw new ApiError(400, 'validation_error', 'Nhãn cần từ 1 đến 32 ký tự gồm chữ, số, dấu cách, gạch ngang hoặc gạch dưới.');
  }
  return { tag, key: tag.toLocaleLowerCase('vi-VN') };
}

function savedCustomerSegment(input) {
  const source = input || {};
  const name = typeof source.name === 'string' ? source.name.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (!name || Array.from(name).length > 48 || !/^[\p{L}\p{N} _.-]+$/u.test(name)) {
    throw new ApiError(400, 'validation_error', 'Tên bộ lọc cần từ 1 đến 48 ký tự gồm chữ, số, dấu cách, dấu chấm, gạch ngang hoặc gạch dưới.');
  }
  const rawCriteria = source.criteria;
  if (!rawCriteria || typeof rawCriteria !== 'object' || Array.isArray(rawCriteria)) {
    throw new ApiError(400, 'validation_error', 'Điều kiện bộ lọc khách hàng không hợp lệ.');
  }
  let segment = '';
  if (rawCriteria.segment !== undefined && rawCriteria.segment !== null && rawCriteria.segment !== '') {
    if (typeof rawCriteria.segment !== 'string' || !CUSTOMER_SEGMENTS.has(rawCriteria.segment)) {
      throw new ApiError(400, 'validation_error', 'Phân khúc khách hàng không được hỗ trợ.');
    }
    segment = rawCriteria.segment;
  }
  let tagLabel = null;
  let tagKey = null;
  if (rawCriteria.tag !== undefined && rawCriteria.tag !== null && rawCriteria.tag !== '') {
    const tag = orderTag(rawCriteria.tag);
    tagLabel = tag.tag;
    tagKey = tag.key;
  }
  let minSpentVnd = null;
  if (rawCriteria.minSpentVnd !== undefined && rawCriteria.minSpentVnd !== null && rawCriteria.minSpentVnd !== '') {
    minSpentVnd = nonNegativeVnd(rawCriteria.minSpentVnd, 'Mức chi tiêu tối thiểu').toString();
  }
  if (!segment && !tagKey && minSpentVnd === null) {
    throw new ApiError(400, 'validation_error', 'Hãy chọn ít nhất một điều kiện trước khi lưu bộ lọc.');
  }
  return {
    name,
    nameKey: name.toLocaleLowerCase('vi-VN'),
    criteria: { segment, tag: tagLabel || '', minSpentVnd: minSpentVnd ?? '' },
    segmentKey: segment || null,
    tagLabel,
    tagKey,
    minSpentVnd,
  };
}

function mutationIdempotencyKey(request, label) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
    throw new ApiError(400, 'idempotency_key_required', `Thiếu mã lưu an toàn cho ${label}. Hãy thử lại.`);
  }
  return key;
}

async function reserveMutationIdempotency(client, { storeId, userId, key, hash, label }) {
  const reserved = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, userId, key, hash]
  );
  if (reserved.rowCount) return null;
  const previous = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, userId, key]
  );
  const record = previous.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(hash)) {
    throw new ApiError(409, 'idempotency_conflict', `Mã lưu ${label} đã được dùng cho nội dung khác.`);
  }
  if (!record.response_body || !record.response_status) {
    throw new ApiError(409, 'request_in_progress', `${label} đang được lưu. Hãy thử lại sau.`);
  }
  return { status: record.response_status, body: record.response_body, replayed: true };
}

async function completeMutationIdempotency(client, { storeId, userId, key, status, body }) {
  await client.query(
    `UPDATE idempotency_records SET response_status = $4, response_body = $5::jsonb, completed_at = now()
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [storeId, userId, key, status, JSON.stringify(body)]
  );
}

function registerRecordRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/customers', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const { limit, offset, search } = pageArgs(request.query);
    const phoneSearch = search.replace(/\D/g, '');
    let segment = '';
    if (request.query?.segment !== undefined) {
      if (typeof request.query.segment !== 'string') throw new ApiError(400, 'validation_error', 'Phân khúc khách hàng không hợp lệ.');
      segment = request.query.segment.trim();
      if (segment && !CUSTOMER_SEGMENTS.has(segment)) throw new ApiError(400, 'validation_error', 'Phân khúc khách hàng không được hỗ trợ.');
    }
    let minSpentVnd = null;
    if (request.query?.minSpentVnd !== undefined && request.query.minSpentVnd !== '') {
      if (typeof request.query.minSpentVnd !== 'string') throw new ApiError(400, 'validation_error', 'Mức chi tiêu tối thiểu không hợp lệ.');
      minSpentVnd = nonNegativeVnd(request.query.minSpentVnd, 'Mức chi tiêu tối thiểu').toString();
    }
    let tagKey = '';
    if (request.query?.tag !== undefined) {
      if (typeof request.query.tag !== 'string') throw new ApiError(400, 'validation_error', 'Nhãn lọc khách hàng không hợp lệ.');
      const rawTag = request.query.tag.trim();
      if (rawTag) tagKey = orderTag(rawTag).key;
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem hồ sơ khách hàng.');
      const result = await client.query(
        `SELECT c.id, c.name, c.phone, c.email, c.note, c.status, c.version,
                customer_balance.balance_vnd::text AS balance_vnd,
                customer_activity.order_count,
                customer_activity.total_spent_vnd::text AS total_spent_vnd,
                COALESCE((SELECT json_agg(json_build_object('key', active.tag_key, 'label', active.tag) ORDER BY active.tag_key)
                          FROM (
                            SELECT DISTINCT ON (tag_key) tag_key, tag, operation
                            FROM customer_tag_events t WHERE t.store_id = c.store_id AND t.customer_id = c.id
                            ORDER BY tag_key, id DESC
                          ) active WHERE active.operation = 'added'), '[]'::json) AS tags,
                customer_activity.latest_order_at,
                c.created_at, c.updated_at, COUNT(*) OVER()::int AS total_count
         FROM customers c
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(l.debit_vnd - l.credit_vnd), 0) AS balance_vnd
           FROM customer_ledger_entries l WHERE l.store_id = c.store_id AND l.customer_id = c.id
         ) customer_balance ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS order_count,
                  COALESCE(SUM(o.total_vnd - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r
                    WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)), 0) AS total_spent_vnd,
                  MAX(o.occurred_at) AS latest_order_at
           FROM orders o WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'
         ) customer_activity ON true
         WHERE c.store_id = $1 AND c.status = 'active'
           AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR ($3 <> '' AND COALESCE(c.phone_normalized, '') LIKE '%' || $3 || '%'))
           AND ($4 = '' OR EXISTS (
             SELECT 1 FROM (
               SELECT DISTINCT ON (tag_key) tag_key, operation
               FROM customer_tag_events t WHERE t.store_id = c.store_id AND t.customer_id = c.id
               ORDER BY tag_key, id DESC
             ) active WHERE active.tag_key = $4 AND active.operation = 'added'
           ))
           AND ($5 = ''
             OR ($5 = 'no_purchase' AND customer_activity.order_count = 0)
             OR ($5 = 'repeat' AND customer_activity.order_count >= 2)
             OR ($5 = 'owing' AND customer_balance.balance_vnd > 0)
             OR ($5 = 'inactive90' AND customer_activity.order_count > 0
                 AND customer_activity.latest_order_at < now() - interval '90 days'))
           AND ($6::bigint IS NULL OR customer_activity.total_spent_vnd >= $6::bigint)
         ORDER BY c.name, c.id LIMIT $7 OFFSET $8`,
        [storeId, search, phoneSearch, tagKey, segment, minSpentVnd, limit + 1, offset]
      );
      const hasMore = result.rows.length > limit;
      return { customers: result.rows.slice(0, limit), total: Number(result.rows[0]?.total_count || 0), nextOffset: hasMore ? offset + limit : null };
    });
  });

  app.get('/api/stores/:storeId/customer-segments', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem phân khúc khách hàng.');
      const result = await client.query(
        `SELECT id, name, segment_key AS segment, tag_label AS tag,
                min_spent_vnd::text AS min_spent_vnd, version, created_at, updated_at
         FROM customer_saved_segments WHERE store_id = $1
         ORDER BY name_key, id LIMIT 50`, [storeId]
      );
      return { segments: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        criteria: { segment: row.segment || '', tag: row.tag || '', minSpentVnd: row.min_spent_vnd ?? '' },
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) };
    });
  });

  app.post('/api/stores/:storeId/customer-segments', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const segment = savedCustomerSegment(request.body);
    const key = mutationIdempotencyKey(request, 'bộ lọc khách hàng');
    const hash = createHash('sha256').update(JSON.stringify({ name: segment.name, criteria: segment.criteria })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_SEGMENT_MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được quản lý bộ lọc đã lưu.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'bộ lọc khách hàng' });
      if (replay) return replay;
      await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
      const count = await client.query('SELECT COUNT(*)::int AS count FROM customer_saved_segments WHERE store_id = $1', [storeId]);
      if (count.rows[0].count >= 50) throw new ApiError(409, 'customer_segment_limit', 'Cửa hàng đã đạt giới hạn 50 bộ lọc đã lưu.');
      const duplicate = await client.query('SELECT 1 FROM customer_saved_segments WHERE store_id = $1 AND name_key = $2', [storeId, segment.nameKey]);
      if (duplicate.rowCount) throw new ApiError(409, 'customer_segment_name_conflict', 'Tên bộ lọc đã được sử dụng trong cửa hàng.');
      const inserted = await client.query(
        `INSERT INTO customer_saved_segments
           (store_id, name, name_key, segment_key, tag_label, tag_key, min_spent_vnd, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING id, name, segment_key AS segment, tag_label AS tag,
                   min_spent_vnd::text AS min_spent_vnd, version, created_at, updated_at`,
        [storeId, segment.name, segment.nameKey, segment.segmentKey, segment.tagLabel, segment.tagKey, segment.minSpentVnd, auth.userId]
      );
      const row = inserted.rows[0];
      const body = { segment: {
        id: row.id, name: row.name,
        criteria: { segment: row.segment || '', tag: row.tag || '', minSpentVnd: row.min_spent_vnd ?? '' },
        version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      } };
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer_segment.created', 'customer_segment', $3, $4, $5::jsonb)`,
        [storeId, auth.userId, row.id, `Lưu bộ lọc khách hàng: ${row.name}`, JSON.stringify({ name: row.name, criteria: segment.criteria })]
      );
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 201, body });
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.put('/api/stores/:storeId/customer-segments/:segmentId', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, segmentId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(segmentId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc bộ lọc không hợp lệ.');
    const segment = savedCustomerSegment(request.body);
    const version = request.body?.version;
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'validation_error', 'Phiên bản bộ lọc không hợp lệ.');
    const key = mutationIdempotencyKey(request, 'bộ lọc khách hàng');
    const hash = createHash('sha256').update(JSON.stringify({ id: segmentId, version, name: segment.name, criteria: segment.criteria })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_SEGMENT_MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được quản lý bộ lọc đã lưu.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'bộ lọc khách hàng' });
      if (replay) return replay;
      const current = await client.query('SELECT * FROM customer_saved_segments WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, segmentId]);
      if (!current.rowCount) throw new ApiError(404, 'customer_segment_not_found', 'Không tìm thấy bộ lọc đã lưu.');
      if (current.rows[0].version !== version) throw new ApiError(409, 'customer_segment_stale', 'Bộ lọc đã được thay đổi ở nơi khác. Hãy tải lại danh sách trước khi lưu.');
      const duplicate = await client.query(
        'SELECT 1 FROM customer_saved_segments WHERE store_id = $1 AND name_key = $2 AND id <> $3',
        [storeId, segment.nameKey, segmentId]
      );
      if (duplicate.rowCount) throw new ApiError(409, 'customer_segment_name_conflict', 'Tên bộ lọc đã được sử dụng trong cửa hàng.');
      const updated = await client.query(
        `UPDATE customer_saved_segments
         SET name = $3, name_key = $4, segment_key = $5, tag_label = $6, tag_key = $7,
             min_spent_vnd = $8, version = version + 1, updated_by = $9, updated_at = now()
         WHERE store_id = $1 AND id = $2
         RETURNING id, name, segment_key AS segment, tag_label AS tag,
                   min_spent_vnd::text AS min_spent_vnd, version, created_at, updated_at`,
        [storeId, segmentId, segment.name, segment.nameKey, segment.segmentKey, segment.tagLabel, segment.tagKey, segment.minSpentVnd, auth.userId]
      );
      const row = updated.rows[0];
      const body = { segment: {
        id: row.id, name: row.name,
        criteria: { segment: row.segment || '', tag: row.tag || '', minSpentVnd: row.min_spent_vnd ?? '' },
        version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
      } };
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer_segment.updated', 'customer_segment', $3, $4, $5::jsonb)`,
        [storeId, auth.userId, row.id, `Cập nhật bộ lọc khách hàng: ${row.name}`, JSON.stringify({ before: { name: current.rows[0].name, segment: current.rows[0].segment_key, tag: current.rows[0].tag_label, minSpentVnd: current.rows[0].min_spent_vnd?.toString() ?? '' }, after: { name: row.name, criteria: segment.criteria } })]
      );
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 200, body });
      return { status: 200, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/customer-segments/:segmentId/delete', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, segmentId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(segmentId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc bộ lọc không hợp lệ.');
    const version = request.body?.version;
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'validation_error', 'Phiên bản bộ lọc không hợp lệ.');
    const key = mutationIdempotencyKey(request, 'bộ lọc khách hàng');
    const hash = createHash('sha256').update(JSON.stringify({ id: segmentId, version, operation: 'delete' })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_SEGMENT_MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được quản lý bộ lọc đã lưu.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'bộ lọc khách hàng' });
      if (replay) return replay;
      const current = await client.query('SELECT * FROM customer_saved_segments WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, segmentId]);
      if (!current.rowCount) throw new ApiError(404, 'customer_segment_not_found', 'Không tìm thấy bộ lọc đã lưu.');
      if (current.rows[0].version !== version) throw new ApiError(409, 'customer_segment_stale', 'Bộ lọc đã được thay đổi ở nơi khác. Hãy tải lại danh sách trước khi xóa.');
      await client.query('DELETE FROM customer_saved_segments WHERE store_id = $1 AND id = $2', [storeId, segmentId]);
      const body = { deleted: true, id: segmentId };
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'customer_segment.deleted', 'customer_segment', $3, $4, $5::jsonb)`,
        [storeId, auth.userId, segmentId, `Xóa bộ lọc khách hàng: ${current.rows[0].name}`, JSON.stringify({ name: current.rows[0].name, segment: current.rows[0].segment_key, tag: current.rows[0].tag_label, minSpentVnd: current.rows[0].min_spent_vnd?.toString() ?? '' })]
      );
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 200, body });
      return { status: 200, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.get('/api/stores/:storeId/customers/:customerId', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem hồ sơ khách hàng.');
      const customerResult = await client.query(
        `SELECT c.id, c.name, c.phone, c.email, c.note, c.status, c.version, c.created_at,
                COALESCE((SELECT SUM(l.debit_vnd - l.credit_vnd) FROM customer_ledger_entries l
                          WHERE l.store_id = c.store_id AND l.customer_id = c.id), 0)::text AS balance_vnd,
                COALESCE((SELECT COUNT(*) FROM orders o WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'), 0)::int AS order_count,
                COALESCE((SELECT SUM(o.total_vnd - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r
                           WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0))
                          FROM orders o WHERE o.store_id = c.store_id AND o.customer_id = c.id AND o.status <> 'voided'), 0)::text AS total_spent_vnd
         FROM customers c WHERE c.store_id = $1 AND c.id = $2 AND c.status = 'active'`,
        [storeId, customerId]
      );
      if (!customerResult.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');
      const tags = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM customer_tag_events WHERE store_id = $1 AND customer_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, customerId]
      );
      const orders = await client.query(
        `SELECT o.id, o.order_number, o.customer_id, o.status,
                o.subtotal_vnd::text AS subtotal_vnd, o.discount_vnd::text AS discount_vnd,
                o.total_vnd::text AS total_vnd, o.note, o.occurred_at,
                COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::text AS paid_vnd,
                COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id
                          WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd,
                COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::text AS return_total_vnd,
                COALESCE((SELECT COUNT(*) FROM order_lines l WHERE l.store_id = o.store_id AND l.order_id = o.id), 0)::int AS line_count
         FROM orders o
         WHERE o.store_id = $1 AND o.customer_id = $2
         ORDER BY o.occurred_at DESC, o.id DESC LIMIT 5`,
        [storeId, customerId]
      );
      const payments = await client.query(
        `SELECT metadata->>'receiptId' AS id,
                metadata->>'amountVnd' AS amount_vnd,
                metadata->>'method' AS method,
                reason AS note,
                occurred_at,
                COALESCE(metadata->'allocations', '[]'::jsonb) AS allocations,
                COALESCE(metadata->>'openingBalanceAmountVnd', '0') AS opening_balance_amount_vnd
         FROM audit_events
         WHERE store_id = $1 AND action = 'customer.payment_recorded'
           AND entity_type = 'customer' AND entity_id = $2
         ORDER BY occurred_at DESC, audit_events.id DESC
         LIMIT 20`,
        [storeId, customerId]
      );
      return {
        customer: { ...customerResult.rows[0], tags: tags.rows.map((tag) => ({ key: tag.tag_key, label: tag.tag })) },
        recentOrders: orders.rows,
        recentPayments: payments.rows,
      };
    });
  });

  app.post('/api/stores/:storeId/customers/:customerId/tags', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    const operation = request.body?.operation;
    if (!['add', 'remove'].includes(operation)) throw new ApiError(400, 'validation_error', 'Thao tác nhãn không hợp lệ.');
    const { tag, key: normalizedTagKey } = orderTag(request.body?.tag);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu an toàn cho nhãn khách hàng. Hãy thử lại.');
    }
    const hash = createHash('sha256').update(JSON.stringify({ operation, tag, normalizedTagKey })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!EDIT_CUSTOMER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền phân loại khách hàng.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'nhãn khách hàng' });
      if (replay) return replay;
      const customer = await client.query(
        'SELECT name FROM customers WHERE store_id = $1 AND id = $2 AND status = \'active\' FOR UPDATE',
        [storeId, customerId]
      );
      if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy hồ sơ khách hàng đang hoạt động.');
      const current = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM customer_tag_events WHERE store_id = $1 AND customer_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, customerId]
      );
      const active = current.rows.find((row) => row.tag_key === normalizedTagKey);
      const changed = operation === 'add' ? !active : Boolean(active);
      if (changed && operation === 'add' && current.rowCount >= 20) {
        throw new ApiError(409, 'customer_tag_limit', 'Mỗi khách hàng chỉ được có tối đa 20 nhãn đang hoạt động.');
      }
      if (changed) {
        await client.query(
          `INSERT INTO customer_tag_events (store_id, customer_id, actor_user_id, tag, tag_key, operation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [storeId, customerId, auth.userId, tag, normalizedTagKey, operation === 'add' ? 'added' : 'removed']
        );
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, $3, 'customer', $4, $5, jsonb_build_object('tag', $6::text))`,
          [storeId, auth.userId, operation === 'add' ? 'customer.tag_added' : 'customer.tag_removed', customerId,
            `${operation === 'add' ? 'Thêm' : 'Gỡ'} nhãn khách hàng: ${tag}`, tag]
        );
      }
      const after = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM customer_tag_events WHERE store_id = $1 AND customer_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, customerId]
      );
      const body = { changed, tags: after.rows.map((row) => ({ key: row.tag_key, label: row.tag })) };
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 200, body });
      return { status: 200, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/customers/import/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const rows = validateCustomerImportRows(request.body?.items);
    const hasOpeningBalance = rows.some((row) => BigInt(row.openingBalanceVnd) > 0n);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_IMPORT_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được nhập khách hàng.');
      if (hasOpeningBalance && !OPENING_BALANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được nhập công nợ ban đầu.');
      }
      const existing = await findCustomerImportConflicts(client, storeId, rows);
      const conflictMessage = describeCustomerImportConflict(rows, existing.rows);
      return {
        valid: !conflictMessage,
        count: rows.length,
        openingBalanceTotalVnd: rows.reduce((sum, row) => sum + BigInt(row.openingBalanceVnd), 0n).toString(),
        conflict: conflictMessage,
      };
    });
  });

  app.post('/api/stores/:storeId/customers/import', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const rows = validateCustomerImportRows(request.body?.items);
    const hasOpeningBalance = rows.some((row) => BigInt(row.openingBalanceVnd) > 0n);
    const importId = randomUUID();
    const requestHash = createHash('sha256').update(JSON.stringify(rows)).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CUSTOMER_IMPORT_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được nhập khách hàng.');
      if (hasOpeningBalance && !OPENING_BALANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được nhập công nợ ban đầu.');
      }
      // Serialize customer creation/import for this store so the duplicate check
      // and inserts cannot race another Slink customer import or manual create.
      await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
      const replay = await reserveMutationIdempotency(client, {
        storeId, userId: auth.userId, key: idempotencyKey, hash: requestHash, label: 'nhập khách hàng',
      });
      if (replay) return replay;
      const existing = await findCustomerImportConflicts(client, storeId, rows);
      const conflictMessage = describeCustomerImportConflict(rows, existing.rows);
      if (conflictMessage) throw new ApiError(409, 'customer_import_conflict', conflictMessage);

      const createdCustomers = [];
      let openingBalanceTotal = 0n;
      for (const row of rows) {
        const customer = row.customer;
        const inserted = await client.query(
          `INSERT INTO customers (store_id, name, phone, phone_normalized, email, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, phone, email, note, status, version, created_at, updated_at`,
          [storeId, customer.name, customer.phone, customer.phoneNormalized, customer.email, customer.note, auth.userId]
        );
        const created = inserted.rows[0];
        const openingBalance = BigInt(row.openingBalanceVnd);
        openingBalanceTotal += openingBalance;
        let openingBalanceEntryId = null;
        if (openingBalance > 0n) {
          openingBalanceEntryId = randomUUID();
          await client.query(
            `INSERT INTO customer_ledger_entries (id, store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, $3, 'manual_debit', $4, 'opening_balance', $5, 'Số dư phải thu mở đầu trước khi sử dụng Slink', $6)`,
            [openingBalanceEntryId, storeId, created.id, openingBalance.toString(), openingBalanceEntryId, auth.userId]
          );
        }
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'customer.created', 'customer', $3, jsonb_build_object('name', $4::text, 'importId', $5::text, 'sourceLine', $6::integer))`,
          [storeId, auth.userId, created.id, created.name, importId, row.sourceLine]
        );
        if (openingBalanceEntryId) {
          await client.query(
            `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
             VALUES ($1, $2, 'customer.opening_balance_recorded', 'customer', $3, 'Số dư công nợ mở đầu khi nhập khách hàng', jsonb_build_object('amountVnd', $4::text, 'ledgerEntryId', $5::text, 'importId', $6::text, 'sourceLine', $7::integer))`,
            [storeId, auth.userId, created.id, openingBalance.toString(), openingBalanceEntryId, importId, row.sourceLine]
          );
        }
        createdCustomers.push({ ...created, balance_vnd: openingBalance.toString(), order_count: 0, total_spent_vnd: '0' });
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'customers.imported', 'customer_import', $3, jsonb_build_object('count', $4::integer, 'openingBalanceTotalVnd', $5::text))`,
        [storeId, auth.userId, importId, createdCustomers.length, openingBalanceTotal.toString()]
      );
      const body = {
        importId,
        count: createdCustomers.length,
        openingBalanceTotalVnd: openingBalanceTotal.toString(),
        customers: createdCustomers,
      };
      await completeMutationIdempotency(client, {
        storeId, userId: auth.userId, key: idempotencyKey, status: 201, body,
      });
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/customers', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const customer = validateCustomer(request.body);
    const openingBalance = nonNegativeVnd(request.body?.openingBalanceVnd, 'Công nợ ban đầu');
    const idempotencyKey = request.headers['idempotency-key'];
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200)) {
      throw new ApiError(400, 'idempotency_key_invalid', 'Mã lưu khách hàng không hợp lệ. Hãy thử lại.');
    }
    if (openingBalance > 0n && !idempotencyKey) throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu an toàn cho khoản công nợ ban đầu. Hãy thử lại.');
    const value = { customer, openingBalanceVnd: openingBalance.toString() };
    const requestHash = idempotencyKey ? createHash('sha256').update(JSON.stringify(value)).digest() : null;
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!CREATE_CUSTOMER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo khách hàng.');
      if (openingBalance > 0n && !OPENING_BALANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng, quản lý hoặc kế toán được ghi công nợ ban đầu.');
      }
      await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
      if (idempotencyKey) {
        const reserved = await client.query(
          `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
          [storeId, auth.userId, idempotencyKey, requestHash]
        );
        if (!reserved.rowCount) {
          const previous = await client.query(
            `SELECT request_hash, response_status, response_body FROM idempotency_records
             WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
            [storeId, auth.userId, idempotencyKey]
          );
          const record = previous.rows[0];
          if (!record || !Buffer.from(record.request_hash).equals(requestHash)) throw new ApiError(409, 'idempotency_conflict', 'Mã lưu khách hàng đã được dùng cho nội dung khác.');
          if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Hồ sơ khách hàng đang được lưu. Hãy thử lại sau.');
          return { status: record.response_status, body: record.response_body, replayed: true };
        }
      }
      const inserted = await client.query(
        `INSERT INTO customers (store_id, name, phone, phone_normalized, email, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, phone, email, note, status, version, created_at, updated_at`,
        [storeId, customer.name, customer.phone, customer.phoneNormalized, customer.email, customer.note, auth.userId]
      );
      const created = inserted.rows[0];
      let openingBalanceEntryId = null;
      if (openingBalance > 0n) {
        openingBalanceEntryId = randomUUID();
        await client.query(
          `INSERT INTO customer_ledger_entries (id, store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, $3, 'manual_debit', $4, 'opening_balance', $5, 'Số dư phải thu mở đầu trước khi sử dụng Slink', $6)`,
          [openingBalanceEntryId, storeId, created.id, openingBalance.toString(), openingBalanceEntryId, auth.userId]
        );
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'customer.created', 'customer', $3, jsonb_build_object('name', $4::text))`,
        [storeId, auth.userId, created.id, created.name]
      );
      if (openingBalanceEntryId) {
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, 'customer.opening_balance_recorded', 'customer', $3, 'Số dư công nợ mở đầu', jsonb_build_object('amountVnd', $4::text, 'ledgerEntryId', $5::text))`,
          [storeId, auth.userId, created.id, openingBalance.toString(), openingBalanceEntryId]
        );
      }
      const body = { customer: { ...created, balance_vnd: openingBalance.toString(), order_count: 0, total_spent_vnd: '0' } };
      if (idempotencyKey) {
        await client.query(
          `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
          [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
        );
      }
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.put('/api/stores/:storeId/customers/:customerId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    const expectedVersion = request.body?.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new ApiError(400, 'validation_error', 'Phiên bản hồ sơ không hợp lệ. Hãy tải lại rồi thử lại.');
    const fields = validateCustomer(request.body, { partial: true });
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!EDIT_CUSTOMER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền quản lý khách hàng.');
      await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
      const currentResult = await client.query('SELECT * FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, customerId]);
      if (!currentResult.rowCount || currentResult.rows[0].status !== 'active') throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');
      const current = currentResult.rows[0];
      if (current.version !== expectedVersion) throw new ApiError(409, 'version_conflict', 'Hồ sơ đã được thay đổi trên thiết bị khác. Hãy tải lại rồi thử lại.');
      const next = {
        name: fields.name ?? current.name,
        phone: fields.phone !== undefined ? fields.phone : current.phone,
        phoneNormalized: fields.phoneNormalized !== undefined ? fields.phoneNormalized : current.phone_normalized,
        email: fields.email !== undefined ? fields.email : current.email,
        note: fields.note ?? current.note,
      };
      const updated = await client.query(
        `UPDATE customers SET name = $3, phone = $4, phone_normalized = $5, email = $6, note = $7,
             version = version + 1, updated_at = now()
         WHERE store_id = $1 AND id = $2 AND version = $8
         RETURNING id, name, phone, email, note, status, version, updated_at`,
        [storeId, customerId, next.name, next.phone, next.phoneNormalized, next.email, next.note, expectedVersion]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'customer.updated', 'customer', $3, jsonb_build_object('version', $4::integer))`,
        [storeId, auth.userId, customerId, updated.rows[0].version]
      );
      return { customer: updated.rows[0] };
    });
  });

  app.post('/api/stores/:storeId/customers/:customerId/archive', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, customerId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(customerId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc khách hàng không hợp lệ.');
    const expectedVersion = request.body?.version;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new ApiError(400, 'validation_error', 'Phiên bản hồ sơ không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!EDIT_CUSTOMER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền quản lý khách hàng.');
      const updated = await client.query(
        `UPDATE customers SET status = 'archived', version = version + 1, updated_at = now()
         WHERE store_id = $1 AND id = $2 AND status = 'active' AND version = $3
         RETURNING id, name, status, version`,
        [storeId, customerId, expectedVersion]
      );
      if (!updated.rowCount) throw new ApiError(409, 'version_conflict', 'Khách hàng đã thay đổi hoặc đã được lưu trữ. Hãy tải lại danh sách.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'customer.archived', 'customer', $3)`,
        [storeId, auth.userId, customerId]
      );
      return { customer: updated.rows[0] };
    });
  });

  app.get('/api/stores/:storeId/orders', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const { limit, offset, search } = pageArgs(request.query);
    const phoneSearch = search.replace(/\D/g, '');
    const status = typeof request.query?.status === 'string' ? request.query.status : 'all';
    if (!['all', 'completed', 'due', 'partially_returned', 'returned'].includes(status)) {
      throw new ApiError(400, 'validation_error', 'Bộ lọc trạng thái đơn hàng không hợp lệ.');
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem đơn hàng.');
      const result = await client.query(
        `SELECT o.id, o.order_number, o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
                o.status, o.subtotal_vnd::text AS subtotal_vnd, o.discount_vnd::text AS discount_vnd,
                o.total_vnd::text AS total_vnd, o.note, o.occurred_at,
                amounts.paid_vnd::text AS paid_vnd, amounts.refunded_vnd::text AS refunded_vnd,
                amounts.return_total_vnd::text AS return_total_vnd,
                COALESCE((SELECT COUNT(*) FROM order_lines l WHERE l.store_id = o.store_id AND l.order_id = o.id), 0)::int AS line_count,
                COUNT(*) OVER()::int AS total_count
         FROM orders o LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
         LEFT JOIN LATERAL (
           SELECT
             COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0) AS paid_vnd,
             COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id
                       WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0) AS refunded_vnd,
             COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0) AS return_total_vnd
         ) amounts ON true
         WHERE o.store_id = $1
           AND ($2 = '' OR o.order_number ILIKE '%' || $2 || '%' OR c.name ILIKE '%' || $2 || '%'
                OR ($3 <> '' AND COALESCE(c.phone_normalized, '') LIKE '%' || $3 || '%')
                OR EXISTS (SELECT 1 FROM order_lines l WHERE l.store_id = o.store_id AND l.order_id = o.id
                           AND (l.sku_snapshot ILIKE '%' || $2 || '%' OR l.product_name_snapshot ILIKE '%' || $2 || '%')))
           AND ($6 = 'all'
                OR ($6 = 'completed' AND o.status = 'completed' AND o.total_vnd - amounts.paid_vnd - amounts.return_total_vnd + amounts.refunded_vnd <= 0)
                OR ($6 = 'due' AND o.status = 'completed' AND o.total_vnd - amounts.paid_vnd - amounts.return_total_vnd + amounts.refunded_vnd > 0)
                OR ($6 = 'partially_returned' AND o.status = 'partially_returned')
                OR ($6 = 'returned' AND o.status = 'returned'))
         ORDER BY o.occurred_at DESC, o.id DESC LIMIT $4 OFFSET $5`,
        [storeId, search, phoneSearch, limit + 1, offset, status]
      );
      const hasMore = result.rows.length > limit;
      return { orders: result.rows.slice(0, limit), total: Number(result.rows[0]?.total_count || 0), nextOffset: hasMore ? offset + limit : null };
    });
  });

  app.get('/api/stores/:storeId/orders/:orderId', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem đơn hàng.');
      const order = await client.query(
        `SELECT o.*, o.subtotal_vnd::text AS subtotal_vnd_text, o.discount_vnd::text AS discount_vnd_text,
                o.total_vnd::text AS total_vnd_text, o.cash_received_vnd::text AS cash_received_vnd_text,
                o.cash_change_vnd::text AS cash_change_vnd_text, c.name AS customer_name, c.phone AS customer_phone,
                u.display_name AS cashier_name, vw.name AS void_restock_warehouse_name
         FROM orders o LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
         LEFT JOIN warehouses vw ON vw.store_id = o.store_id AND vw.id = o.void_restock_warehouse_id
         JOIN users u ON u.id = o.cashier_id
         WHERE o.store_id = $1 AND o.id = $2`,
        [storeId, orderId]
      );
      if (!order.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const lines = await client.query(
        `SELECT ol.id, ol.product_id, ol.product_name_snapshot, ol.sku_snapshot, ol.unit_snapshot, ol.quantity::text AS quantity,
                ol.unit_price_vnd::text AS unit_price_vnd,
                CASE WHEN $3::boolean THEN ol.unit_cost_vnd::text ELSE NULL END AS unit_cost_vnd,
                ol.discount_vnd::text AS discount_vnd, ol.line_total_vnd::text AS line_total_vnd,
                COALESCE((SELECT SUM(rl.quantity) FROM return_lines rl JOIN returns r ON r.id = rl.return_id
                          WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND r.status = 'completed'), 0)::text AS returned_quantity
         FROM order_lines ol WHERE ol.store_id = $1 AND ol.order_id = $2 ORDER BY ol.id`,
        [storeId, orderId, ['owner', 'manager', 'accountant'].includes(membership.role)]
      );
      const payments = await client.query(
        `SELECT id, method, status, amount_vnd::text AS amount_vnd, provider_reference, occurred_at
         FROM payments WHERE store_id = $1 AND order_id = $2 ORDER BY occurred_at, id`,
        [storeId, orderId]
      );
      const returns = await client.query(
        `SELECT r.id, r.return_number, r.status, r.reason, r.refund_total_vnd::text AS refund_total_vnd,
                r.restock_policy, r.restock_warehouse_id, w.name AS restock_warehouse_name, r.occurred_at,
                COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f WHERE f.store_id = r.store_id AND f.return_id = r.id AND f.status = 'succeeded'), 0)::text AS refunded_vnd
         FROM returns r LEFT JOIN warehouses w ON w.store_id = r.store_id AND w.id = r.restock_warehouse_id
         WHERE r.store_id = $1 AND r.order_id = $2 ORDER BY r.occurred_at, r.id`,
        [storeId, orderId]
      );
      const notes = await client.query(
        `SELECT recent.id, recent.note, recent.created_at, recent.actor_user_id,
                u.display_name AS actor_name, totals.total_count
         FROM (
           SELECT id, note, created_at, actor_user_id
           FROM order_internal_notes WHERE store_id = $1 AND order_id = $2
           ORDER BY id DESC LIMIT 100
         ) recent
         JOIN users u ON u.id = recent.actor_user_id
         CROSS JOIN LATERAL (
           SELECT COUNT(*)::int AS total_count FROM order_internal_notes WHERE store_id = $1 AND order_id = $2
         ) totals
         ORDER BY recent.id ASC`,
        [storeId, orderId]
      );
      const tags = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM order_tag_events WHERE store_id = $1 AND order_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, orderId]
      );
      const item = order.rows[0];
      const internalNotesTotal = Number(notes.rows[0]?.total_count || 0);
      return {
        order: {
          id: item.id,
          number: item.order_number,
          customerId: item.customer_id,
          customerName: item.customer_name,
          customerPhone: item.customer_phone,
          cashierName: item.cashier_name,
          status: item.status,
          subtotalVnd: item.subtotal_vnd_text,
          discountVnd: item.discount_vnd_text,
          totalVnd: item.total_vnd_text,
          cashReceivedVnd: item.cash_received_vnd_text,
          cashChangeVnd: item.cash_change_vnd_text,
          note: item.note,
          internalNotes: notes.rows.map((note) => ({
            id: String(note.id),
            note: note.note,
            createdAt: note.created_at,
            actor: { id: note.actor_user_id, name: note.actor_name },
          })),
          internalNotesTotal,
          internalNotesNextBeforeId: internalNotesTotal > notes.rows.length ? String(notes.rows[0]?.id || '') || null : null,
          tags: tags.rows.map((tag) => ({ key: tag.tag_key, label: tag.tag })),
          occurredAt: item.occurred_at,
          voidRestockWarehouseId: item.void_restock_warehouse_id,
          voidRestockWarehouseName: item.void_restock_warehouse_name,
          items: lines.rows,
          payments: payments.rows,
          returns: returns.rows,
        },
      };
    });
  });

  app.get('/api/stores/:storeId/orders/:orderId/internal-notes', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const rawBeforeId = request.query?.beforeId;
    if (typeof rawBeforeId !== 'string' || !/^[1-9]\d{0,18}$/.test(rawBeforeId) || BigInt(rawBeforeId) > MAX_BIGINT) {
      throw new ApiError(400, 'validation_error', 'Mốc ghi chú không hợp lệ. Hãy tải lại chi tiết đơn hàng.');
    }
    const rawLimit = request.query?.limit;
    if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !/^\d{1,3}$/.test(rawLimit))) {
      throw new ApiError(400, 'validation_error', 'Số ghi chú mỗi trang không hợp lệ.');
    }
    const limit = Math.min(Math.max(Number(rawLimit || 100), 1), 100);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_VIEW_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xem ghi chú đơn hàng.');
      const order = await client.query('SELECT id FROM orders WHERE store_id = $1 AND id = $2', [storeId, orderId]);
      if (!order.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const result = await client.query(
        `SELECT older.id, older.note, older.created_at, older.actor_user_id, u.display_name AS actor_name
         FROM (
           SELECT id, note, created_at, actor_user_id
           FROM order_internal_notes
           WHERE store_id = $1 AND order_id = $2 AND id < $3::bigint
           ORDER BY id DESC
           LIMIT $4
         ) older
         JOIN users u ON u.id = older.actor_user_id
         ORDER BY older.id ASC`,
        [storeId, orderId, rawBeforeId, limit + 1]
      );
      const hasMore = result.rows.length > limit;
      // Results are returned oldest-first; the extra lookahead row is the first row.
      const rows = hasMore ? result.rows.slice(1, limit + 1) : result.rows;
      const notes = rows.map((note) => ({
        id: String(note.id), note: note.note, createdAt: note.created_at,
        actor: { id: note.actor_user_id, name: note.actor_name },
      }));
      return {
        notes,
        hasMore,
        nextBeforeId: hasMore ? notes[0]?.id || null : null,
      };
    });
  });

  app.post('/api/stores/:storeId/orders/:orderId/internal-notes', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const note = typeof request.body?.note === 'string' ? request.body.note.normalize('NFC').trim() : '';
    if (!note || Array.from(note).length > 1000 || note.includes('\u0000')) {
      throw new ApiError(400, 'validation_error', 'Ghi chú nội bộ cần từ 1 đến 1.000 ký tự.');
    }
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu an toàn cho ghi chú. Hãy thử lại.');
    }
    const hash = createHash('sha256').update(JSON.stringify({ note })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_COLLABORATE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền ghi chú đơn hàng.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'ghi chú' });
      if (replay) return replay;
      const order = await client.query('SELECT order_number FROM orders WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, orderId]);
      if (!order.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const inserted = await client.query(
        `INSERT INTO order_internal_notes (store_id, order_id, actor_user_id, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id, note, created_at`,
        [storeId, orderId, auth.userId, note]
      );
      const row = inserted.rows[0];
      const actor = await client.query('SELECT display_name FROM users WHERE id = $1', [auth.userId]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'order.note_added', 'order', $3, 'Đã thêm ghi chú nội bộ', jsonb_build_object('noteId', $4::text))`,
        [storeId, auth.userId, orderId, String(row.id)]
      );
      const body = { note: { id: String(row.id), note: row.note, createdAt: row.created_at,
        actor: { id: auth.userId, name: actor.rows[0]?.display_name || '' } } };
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 201, body });
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/orders/:orderId/tags', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const operation = request.body?.operation;
    if (!['add', 'remove'].includes(operation)) throw new ApiError(400, 'validation_error', 'Thao tác nhãn không hợp lệ.');
    const { tag, key: tagKey } = orderTag(request.body?.tag);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu an toàn cho nhãn. Hãy thử lại.');
    }
    const hash = createHash('sha256').update(JSON.stringify({ operation, tag, tagKey })).digest();
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ORDER_COLLABORATE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền gắn nhãn đơn hàng.');
      const replay = await reserveMutationIdempotency(client, { storeId, userId: auth.userId, key, hash, label: 'nhãn đơn hàng' });
      if (replay) return replay;
      const order = await client.query('SELECT order_number FROM orders WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, orderId]);
      if (!order.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const current = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM order_tag_events WHERE store_id = $1 AND order_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, orderId]
      );
      const active = current.rows.find((row) => row.tag_key === tagKey);
      const changed = operation === 'add' ? !active : Boolean(active);
      if (changed && operation === 'add' && current.rowCount >= 20) {
        throw new ApiError(409, 'order_tag_limit', 'Đơn hàng chỉ được có tối đa 20 nhãn đang hoạt động.');
      }
      if (changed) {
        await client.query(
          `INSERT INTO order_tag_events (store_id, order_id, actor_user_id, tag, tag_key, operation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [storeId, orderId, auth.userId, tag, tagKey, operation === 'add' ? 'added' : 'removed']
        );
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, $3, 'order', $4, $5, jsonb_build_object('tag', $6::text))`,
          [storeId, auth.userId, operation === 'add' ? 'order.tag_added' : 'order.tag_removed', orderId,
            `${operation === 'add' ? 'Thêm' : 'Gỡ'} nhãn đơn hàng: ${tag}`, tag]
        );
      }
      const after = await client.query(
        `SELECT tag_key, tag FROM (
           SELECT DISTINCT ON (tag_key) tag_key, tag, operation
           FROM order_tag_events WHERE store_id = $1 AND order_id = $2
           ORDER BY tag_key, id DESC
         ) latest WHERE operation = 'added' ORDER BY tag_key`,
        [storeId, orderId]
      );
      const body = { changed, tags: after.rows.map((row) => ({ key: row.tag_key, label: row.tag })) };
      await completeMutationIdempotency(client, { storeId, userId: auth.userId, key, status: 200, body });
      return { status: 200, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });

  app.post('/api/stores/:storeId/orders/:orderId/void', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
    if (reason.length < 1 || reason.length > 450) throw new ApiError(400, 'validation_error', 'Lý do hủy cần từ 1 đến 450 ký tự.');
    if (request.body?.stockConfirmed !== true) throw new ApiError(400, 'stock_confirmation_required', 'Xác nhận hàng chưa giao hoặc đã được đưa lại cửa hàng trước khi hủy đơn.');
    const requestedWarehouseId = request.body?.warehouseId;
    if (requestedWarehouseId != null && (typeof requestedWarehouseId !== 'string' || !UUID_PATTERN.test(requestedWarehouseId))) {
      throw new ApiError(400, 'validation_error', 'Kho nhận lại tồn không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!VOID_ORDER_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới được hủy đơn.');
      const linkedOrder = await client.query(
        'SELECT customer_id FROM orders WHERE store_id = $1 AND id = $2',
        [storeId, orderId]
      );
      if (!linkedOrder.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      if (linkedOrder.rows[0].customer_id) {
        await client.query(
          'SELECT id FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE',
          [storeId, linkedOrder.rows[0].customer_id]
        );
      }
      const orderResult = await client.query(
        `SELECT id, order_number, customer_id, warehouse_id, void_restock_warehouse_id, status, total_vnd::text AS total_vnd
         FROM orders WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, orderId]
      );
      if (!orderResult.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const order = orderResult.rows[0];
      if (order.status === 'voided') {
        const priorDestination = await client.query(
          `SELECT id, name FROM warehouses WHERE store_id = $1 AND id = $2`,
          [storeId, order.void_restock_warehouse_id]
        );
        return {
          orderId,
          status: 'voided',
          alreadyVoided: true,
          restockWarehouseId: priorDestination.rows[0]?.id || null,
          restockWarehouseName: priorDestination.rows[0]?.name || null,
        };
      }
      if (order.status !== 'completed') throw new ApiError(409, 'order_not_voidable', 'Đơn đã trả hàng hoặc có trạng thái khác; hãy dùng quy trình trả hàng để giữ đúng lịch sử.');
      const destinationId = requestedWarehouseId || order.warehouse_id;
      const destination = await client.query(
        `SELECT id, name, status FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, destinationId]
      );
      if (!destination.rowCount) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận lại tồn.');
      if (destination.rows[0].status !== 'active') throw new ApiError(409, 'warehouse_inactive', 'Kho nhận lại tồn đã lưu trữ. Hãy chọn kho đang hoạt động.');

      // Keep queries on the checked-out transaction client sequential for node-postgres compatibility.
      const payments = await client.query('SELECT id FROM payments WHERE store_id = $1 AND order_id = $2 LIMIT 1', [storeId, orderId]);
      const completedReturns = await client.query("SELECT id FROM returns WHERE store_id = $1 AND order_id = $2 AND status = 'completed' LIMIT 1", [storeId, orderId]);
      const saleMovements = await client.query(
        `SELECT product_id, warehouse_id, quantity_delta::text AS quantity_delta
         FROM inventory_movements
         WHERE store_id = $1 AND source_type = 'order' AND source_id = $2 AND movement_type = 'sale'
         ORDER BY product_id FOR UPDATE`,
        [storeId, orderId]
      );
      if (payments.rowCount) throw new ApiError(409, 'payment_must_be_refunded', 'Đơn đã có giao dịch thanh toán. Hãy xử lý trả hàng và hoàn tiền để giữ đối soát chính xác.');
      if (completedReturns.rowCount) throw new ApiError(409, 'order_has_returns', 'Đơn đã có hàng trả; không thể hủy trực tiếp.');

      for (const movement of saleMovements.rows) {
        if (!movement.quantity_delta.startsWith('-')) throw new Error('Sale inventory movement has an unexpected sign.');
        const quantity = movement.quantity_delta.slice(1);
        const updatedBalance = await client.query(
          `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
           VALUES ($1, $2, $3, $4::numeric, 0)
           ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
             SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
                 version = inventory_balances.version + 1, updated_at = now()
           RETURNING on_hand::text AS on_hand`,
          [storeId, destination.rows[0].id, movement.product_id, quantity]
        );
        await client.query(
          `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                             reason, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'reversal', $4::numeric, $5::numeric, $6, 'order_void', $7, $8)`,
          [storeId, destination.rows[0].id, movement.product_id, quantity, updatedBalance.rows[0].on_hand,
            `Hủy đơn ${order.order_number}: ${reason}`, orderId, auth.userId]
        );
      }

      if (order.customer_id && BigInt(order.total_vnd) > 0n) {
        await client.query(
          `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
           VALUES ($1, $2, 'reversal', $3, 'order_void', $4, $5, $6)`,
          [storeId, order.customer_id, order.total_vnd, orderId, `Hủy đơn ${order.order_number}: ${reason}`, auth.userId]
        );
      }
      await client.query("UPDATE orders SET status = 'voided', void_restock_warehouse_id = $3, updated_at = now() WHERE store_id = $1 AND id = $2", [storeId, orderId, destination.rows[0].id]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'sale.voided', 'order', $3, $4,
                 jsonb_build_object('orderNumber', $5::text, 'totalVnd', $6::text,
                                    'restockWarehouseId', $7::text, 'restockWarehouseName', $8::text))`,
        [storeId, auth.userId, orderId, reason, order.order_number, order.total_vnd, destination.rows[0].id, destination.rows[0].name]
      );
      return { orderId, status: 'voided', alreadyVoided: false, restockWarehouseId: destination.rows[0].id, restockWarehouseName: destination.rows[0].name };
    });
  });
}

module.exports = { registerRecordRoutes, validateCustomer };
