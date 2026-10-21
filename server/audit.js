'use strict';

const { authenticate, ApiError } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const AUDIT_ROLES = new Set(['owner', 'manager']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, label) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'validation_error', `${label} không tồn tại.`);
  }
  return value;
}

function registerAuditRoutes(app, { pool }) {
  app.get('/api/stores/:storeId/audit-events', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const query = request.query || {};
    const from = parseDate(query.from, 'Ngày bắt đầu');
    const to = parseDate(query.to, 'Ngày kết thúc');
    if (from && to && from > to) throw new ApiError(400, 'validation_error', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    if (from && to && Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
      throw new ApiError(400, 'date_range_too_large', 'Khoảng xem nhật ký tối đa là 367 ngày.');
    }
    const actorId = query.actorId === undefined || query.actorId === '' ? null : String(query.actorId);
    if (actorId && !UUID_PATTERN.test(actorId)) throw new ApiError(400, 'validation_error', 'Nhân viên lọc không hợp lệ.');
    const action = typeof query.action === 'string' ? query.action.trim() : '';
    const entityType = typeof query.entityType === 'string' ? query.entityType.trim() : '';
    const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
    if (action.length > 100 || entityType.length > 80) throw new ApiError(400, 'validation_error', 'Bộ lọc nhật ký quá dài.');
    const requestedLimit = Number(query.limit || 50);
    const requestedOffset = Number(query.offset || 0);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
    const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 1_000_000)) : 0;

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!AUDIT_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Nhật ký cửa hàng chỉ dành cho chủ cửa hàng và quản lý.');
      const values = [storeId, from, to, actorId, action, entityType, search, membership.timezone];
      const where = `e.store_id = $1
        AND ($2::date IS NULL OR e.occurred_at >= ($2::date::timestamp AT TIME ZONE $8))
        AND ($3::date IS NULL OR e.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE $8))
        AND ($4::uuid IS NULL OR e.actor_user_id = $4)
        AND ($5 = '' OR e.action = $5)
        AND ($6 = '' OR e.entity_type = $6)
        AND ($7 = '' OR e.action ILIKE '%' || $7 || '%' OR e.entity_type ILIKE '%' || $7 || '%'
             OR e.reason ILIKE '%' || $7 || '%' OR e.entity_id::text ILIKE '%' || $7 || '%'
             OR u.display_name ILIKE '%' || $7 || '%')`;
      const result = await client.query(
        `WITH filtered AS MATERIALIZED (
           SELECT e.id, e.occurred_at, e.actor_user_id, u.display_name AS actor_name,
                  e.action, e.entity_type, e.entity_id, e.reason
           FROM audit_events e JOIN users u ON u.id = e.actor_user_id WHERE ${where}
         ), totals AS (SELECT COUNT(*)::int AS total FROM filtered),
         page AS (
           SELECT * FROM filtered ORDER BY occurred_at DESC, id DESC LIMIT $9 OFFSET $10
         )
         SELECT totals.total, page.id, page.occurred_at, page.actor_user_id, page.actor_name,
                page.action, page.entity_type, page.entity_id, page.reason
         FROM totals LEFT JOIN page ON true`,
        [...values, limit, offset]
      );
      const total = Number(result.rows[0]?.total || 0);
      return {
        events: result.rows.filter((row) => row.id).map((row) => ({
          id: row.id,
          occurredAt: row.occurred_at,
          actor: { id: row.actor_user_id, name: row.actor_name },
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          reason: row.reason,
        })),
        total,
        limit,
        offset,
        nextOffset: offset + result.rows.length < total ? offset + result.rows.length : null,
      };
    });
  });
}

module.exports = { registerAuditRoutes };
