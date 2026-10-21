'use strict';

const SECURITY_EVENT_TYPES = new Set([
  'login_succeeded',
  'login_failed',
  'email_verified',
  'logout',
  'password_changed',
  'session_revoked',
]);

async function recordSecurityEvent(client, userId, eventType, sessionId = null) {
  if (!SECURITY_EVENT_TYPES.has(eventType)) throw new TypeError('Unsupported account security event.');
  await client.query(
    `INSERT INTO user_security_events (user_id, session_id, event_type)
     VALUES ($1, $2, $3)`,
    [userId, sessionId, eventType]
  );
}

module.exports = { recordSecurityEvent };
