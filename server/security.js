'use strict';

const { authenticate, ApiError, requireCsrf } = require('./auth');
const { UUID_PATTERN, withUser } = require('./db');
const { recordSecurityEvent } = require('./security-events');

function registerSecurityRoutes(app, { pool, env }) {
  app.get('/api/auth/security', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await authenticate(pool, request);
    return withUser(pool, auth.userId, async (client) => {
      const sessions = await client.query(
        `SELECT id, created_at, expires_at, (token_digest = $2) AS is_current
         FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [auth.userId, auth.tokenDigest]
      );
      const events = await client.query(
        `SELECT id, session_id, event_type, occurred_at
         FROM user_security_events
         WHERE user_id = $1
         ORDER BY occurred_at DESC, id DESC
         LIMIT 50`,
        [auth.userId]
      );
      return {
        sessions: sessions.rows.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          current: row.is_current,
        })),
        events: events.rows.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          type: row.event_type,
          occurredAt: row.occurred_at,
        })),
      };
    });
  });

  app.post('/api/auth/sessions/:sessionId/revoke', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { sessionId } = request.params;
    if (!UUID_PATTERN.test(sessionId)) throw new ApiError(400, 'validation_error', 'Phiên đăng nhập không hợp lệ.');

    return withUser(pool, auth.userId, async (client) => {
      const found = await client.query(
        `SELECT id, token_digest, revoked_at FROM sessions
         WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, auth.userId]
      );
      if (!found.rowCount) throw new ApiError(404, 'session_not_found', 'Không tìm thấy phiên đăng nhập này.');
      const session = found.rows[0];
      if (Buffer.from(session.token_digest).equals(auth.tokenDigest)) {
        throw new ApiError(409, 'current_session', 'Đây là phiên hiện tại. Hãy dùng nút đăng xuất trên thiết bị này.');
      }
      if (session.revoked_at) return { status: 'already_revoked' };

      await client.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2', [sessionId, auth.userId]);
      await recordSecurityEvent(client, auth.userId, 'session_revoked', sessionId);
      return { status: 'revoked' };
    });
  });
}

module.exports = { registerSecurityRoutes };
