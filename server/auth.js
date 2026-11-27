'use strict';

const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  scryptSync,
  timingSafeEqual,
} = require('node:crypto');
const { promisify } = require('node:util');
const { listStores, withUser } = require('./db');
const { recordSecurityEvent } = require('./security-events');
const { createFirebaseVerifier, getPublicFirebaseConfig, isFirebaseFullyConfigured } = require('./firebase-auth');
const {
  createCaptchaChallenge,
  createRegistrationTicket,
  decodeSignedTokenPayload,
  isCaptchaRequired,
  persistConsumedSecurityTicket,
  verifyCaptchaChallenge,
  verifyRegistrationTicket,
} = require('./captcha');
const { assertSafeOutboundUrl } = require('./providers/safe-url');

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'slink_session';
const CSRF_COOKIE = 'slink_csrf';
const SESSION_DAYS = 14;
const VERIFY_HOURS = 24;
const PASSWORD_RESET_HOURS = 1;
const PASSWORD_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function emailVerificationDisabled(env) {
  return env.NODE_ENV !== 'production' && env.DEMO_DISABLE_EMAIL_VERIFICATION === 'true';
}

async function requireCaptchaIfEnabled(pool, env, body) {
  if (!isCaptchaRequired(env)) return;
  if (!verifyCaptchaChallenge(env, body?.captchaToken, body?.captchaAnswer)) {
    throw new ApiError(400, 'captcha_invalid', 'Mã xác nhận CAPTCHA không đúng hoặc đã hết hạn. Vui lòng nhập lại.');
  }
  const payload = decodeSignedTokenPayload(env, body?.captchaToken);
  if (payload?.id) {
    const firstUse = await persistConsumedSecurityTicket(pool, {
      ticketId: `captcha:${payload.id}`,
      kind: 'captcha',
      expiresAtMs: payload.exp,
    });
    if (!firstUse) {
      throw new ApiError(400, 'captcha_invalid', 'Mã xác nhận CAPTCHA đã được sử dụng hoặc hết hạn. Vui lòng nhập lại.');
    }
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, PASSWORD_OPTIONS);
  return `scrypt$${PASSWORD_OPTIONS.N}$${PASSWORD_OPTIONS.r}$${PASSWORD_OPTIONS.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

const dummySalt = Buffer.from('slink-dummy-salt');
const DUMMY_PASSWORD_HASH = `scrypt$${PASSWORD_OPTIONS.N}$${PASSWORD_OPTIONS.r}$${PASSWORD_OPTIONS.p}$${dummySalt.toString('base64url')}$${scryptSync('slink-invalid-account-password', dummySalt, 64, PASSWORD_OPTIONS).toString('base64url')}`;

async function verifyPassword(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, hashText] = parts;
  const N = Number(n);
  const costR = Number(r);
  const costP = Number(p);
  if (N !== PASSWORD_OPTIONS.N || costR !== PASSWORD_OPTIONS.r || costP !== PASSWORD_OPTIONS.p) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(hashText, 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length, PASSWORD_OPTIONS);
  return timingSafeEqual(actual, expected);
}

function cookieOptions(env, maxAge) {
  return {
    path: '/',
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge,
  };
}

function setSessionCookies(reply, env, sessionToken, csrfToken) {
  const options = cookieOptions(env, SESSION_DAYS * 24 * 60 * 60);
  reply.setCookie(SESSION_COOKIE, sessionToken, { ...options, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, csrfToken, { ...options, httpOnly: false });
}

function clearSessionCookies(reply, env) {
  const options = { ...cookieOptions(env, 0), expires: new Date(0) };
  reply.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}

async function authenticate(pool, request) {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || token.length > 128) throw new ApiError(401, 'unauthorized', 'Vui lòng đăng nhập để tiếp tục.');
  const tokenDigest = digest(token);
  const result = await pool.query(
    `SELECT s.user_id, s.csrf_digest, u.email, u.display_name, u.workspace_mode
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_digest = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
       AND u.status = 'active' AND (u.email_verified_at IS NOT NULL OR $2::boolean)`,
    [tokenDigest, Boolean(request.server?.slinkEmailVerificationDisabled)]
  );
  if (!result.rowCount) throw new ApiError(401, 'unauthorized', 'Vui lòng đăng nhập để tiếp tục.');
  request.auth = {
    userId: result.rows[0].user_id,
    email: result.rows[0].email,
    displayName: result.rows[0].display_name,
    workspaceMode: result.rows[0].workspace_mode,
    tokenDigest,
    csrfDigest: result.rows[0].csrf_digest,
  };
  return request.auth;
}

function assertSameOrigin(request, env) {
  const expectedOrigin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null;
  const origin = request.headers.origin;
  if (expectedOrigin && origin !== expectedOrigin) {
    throw new ApiError(403, 'origin_rejected', 'Nguồn yêu cầu không được chấp nhận.');
  }
}

function requireCsrf(request, env) {
  assertSameOrigin(request, env);
  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers['x-csrf-token'];
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string' || cookieToken !== headerToken || cookieToken.length > 128) {
    throw new ApiError(403, 'csrf_rejected', 'Phiên bảo mật đã hết hạn. Vui lòng tải lại trang.');
  }
  const actual = digest(cookieToken);
  if (!timingSafeEqual(actual, request.auth.csrfDigest)) {
    throw new ApiError(403, 'csrf_rejected', 'Phiên bảo mật đã hết hạn. Vui lòng tải lại trang.');
  }
}

async function deliverEmail(env, email, subject, text, developmentUrl) {
  const effectiveUrl = env.EMAIL_DELIVERY_URL || (env.RESEND_API_KEY?.trim() ? 'https://api.resend.com/emails' : '');
  const effectiveToken = env.EMAIL_DELIVERY_TOKEN || env.RESEND_API_KEY || '';
  if (!effectiveUrl) {
    if (env.NODE_ENV === 'production') throw new ApiError(503, 'email_unavailable', 'Dịch vụ gửi thư chưa được cấu hình.');
    return { delivered: false, developmentUrl };
  }
  let deliveryUrl;
  try {
    deliveryUrl = assertSafeOutboundUrl(effectiveUrl, {
      allowLocalInTest: env.NODE_ENV !== 'production',
      label: 'dịch vụ gửi thư',
    });
  } catch {
    throw new ApiError(503, 'email_unavailable', 'Dịch vụ gửi thư chưa được cấu hình an toàn.');
  }
  if (env.NODE_ENV === 'production' && (!effectiveToken || !env.EMAIL_FROM?.trim())) {
    throw new ApiError(503, 'email_unavailable', 'Dịch vụ gửi thư chưa được cấu hình an toàn.');
  }
  let response;
  try {
    response = await fetch(deliveryUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        ...(effectiveToken ? { authorization: `Bearer ${effectiveToken}` } : {}),
      },
      body: JSON.stringify({
        ...(typeof env.EMAIL_FROM === 'string' && env.EMAIL_FROM.trim() ? { from: env.EMAIL_FROM.trim() } : {}),
        to: email,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError(503, 'email_unavailable', 'Chưa thể gửi thư xác nhận. Vui lòng thử lại sau.');
  }
  if (!response.ok) {
    const error = new ApiError(503, 'email_unavailable', 'Chưa thể gửi thư xác nhận. Vui lòng thử lại sau.');
    error.providerStatus = response.status;
    throw error;
  }
  return { delivered: true };
}

async function sendVerification(env, email, verificationUrl) {
  return deliverEmail(env, email, 'Xác nhận tài khoản Slink', `Mở liên kết này để xác nhận email của bạn: ${verificationUrl}`, verificationUrl);
}

async function sendPasswordReset(env, email, resetUrl) {
  return deliverEmail(env, email, 'Đặt lại mật khẩu Slink', `Mở liên kết này để đặt lại mật khẩu Slink của bạn: ${resetUrl}`, resetUrl);
}

async function recordVerificationToken(client, userId) {
  const token = newToken();
  await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1 AND consumed_at IS NULL', [userId]);
  await client.query(
    `INSERT INTO email_verification_tokens (user_id, token_digest, expires_at)
     VALUES ($1, $2, now() + ($3::text || ' hours')::interval)`,
    [userId, digest(token), VERIFY_HOURS]
  );
  return token;
}

async function createUserSession(pool, userId, reply, env, { activatePendingOwner = false } = {}) {
  const demoBypass = emailVerificationDisabled(env);
  const sessionToken = newToken();
  const csrfToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const user = await withUser(pool, userId, async (client) => {
    const found = await client.query(
      'SELECT id, email, display_name, workspace_mode, status, email_verified_at FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!found.rowCount) throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
    let accountStatus = found.rows[0].status;
    if (accountStatus === 'pending' && activatePendingOwner && demoBypass && !found.rows[0].email_verified_at) {
      const ownerMembership = await client.query(
        "SELECT 1 FROM memberships WHERE user_id = $1 AND role = 'owner' AND status = 'active' LIMIT 1",
        [userId]
      );
      if (!ownerMembership.rowCount) throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
      await client.query("UPDATE users SET status = 'active', updated_at = now() WHERE id = $1", [userId]);
      await client.query(
        'UPDATE email_verification_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL',
        [userId]
      );
      accountStatus = 'active';
    }
    if (accountStatus !== 'active' || (!found.rows[0].email_verified_at && !demoBypass)) {
      throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
    }
    const session = await client.query(
      'INSERT INTO sessions (user_id, token_digest, csrf_digest, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, digest(sessionToken), digest(csrfToken), expiresAt]
    );
    await recordSecurityEvent(client, userId, 'login_succeeded', session.rows[0].id);
    return found.rows[0];
  });
  const stores = await listStores(pool, userId);
  setSessionCookies(reply, env, sessionToken, csrfToken);
  return { user: { id: user.id, email: user.email, displayName: user.display_name, workspaceMode: user.workspace_mode }, stores };
}

function registerAuthRoutes(app, { pool, env, firebaseVerifier = null }) {
  const verifier = createFirebaseVerifier(env, firebaseVerifier);

  app.get('/api/auth/policy', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      emailVerificationRequired: !emailVerificationDisabled(env),
      captchaRequired: isCaptchaRequired(env),
      firebaseEnabled: isFirebaseFullyConfigured(env, verifier.configured),
      passwordChangeRequiresEmail: Boolean(verifier.configured || env.NODE_ENV === 'production'),
    };
  });

  app.get('/api/auth/captcha', {
    config: { rateLimit: { max: 40, timeWindow: '15 minutes' } },
  }, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return createCaptchaChallenge(env);
  });

  app.get('/api/auth/firebase/config', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return getPublicFirebaseConfig(env, verifier.configured);
  });

  app.post('/api/auth/firebase', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    assertSameOrigin(request, env);
    if (!verifier.configured) {
      throw new ApiError(503, 'firebase_auth_unavailable', 'Đăng nhập Google chưa được cấu hình.');
    }
    const body = request.body || {};
    const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken || idToken.length < 20 || idToken.length > 8192) {
      throw new ApiError(400, 'validation_error', 'Mã xác thực Firebase không hợp lệ.');
    }
    let decoded;
    try {
      decoded = await verifier.verifyIdToken(idToken);
    } catch {
      throw new ApiError(401, 'invalid_firebase_token', 'Phiên xác thực Firebase không hợp lệ hoặc đã hết hạn.');
    }
    const firebaseUid = typeof decoded?.uid === 'string' ? decoded.uid.trim() : '';
    if (!firebaseUid || firebaseUid.length > 128) {
      throw new ApiError(401, 'invalid_firebase_token', 'Không xác định được tài khoản Firebase.');
    }
    const provider = String(decoded.firebase?.sign_in_provider || 'firebase').slice(0, 64);
    const tokenEmail = typeof decoded.email === 'string' ? decoded.email.trim() : '';
    const tokenEmailNormalized = tokenEmail.toLowerCase();
    const tokenEmailVerified = Boolean(decoded.email_verified);
    const tokenName = typeof decoded.name === 'string' ? decoded.name.trim().slice(0, 120) : '';
    if (!['google.com', 'password'].includes(provider) || !tokenEmail || tokenEmail.length > 254 || !tokenEmailVerified) {
      throw new ApiError(403, 'email_not_verified', 'Chỉ chấp nhận tài khoản Google hoặc email đã xác minh.');
    }

    let existing = (await pool.query(
      `SELECT id, email, display_name, status, email_verified_at, firebase_uid
       FROM users WHERE firebase_uid = $1 LIMIT 1`,
      [firebaseUid]
    )).rows[0];
    if (!existing) {
      existing = (await pool.query(
        `SELECT id, email, display_name, status, email_verified_at, firebase_uid
         FROM users WHERE email_normalized = $1 LIMIT 1`,
        [tokenEmailNormalized]
      )).rows[0];
    }

    if (existing) {
      if (existing.status === 'disabled') {
        throw new ApiError(403, 'account_disabled', 'Tài khoản này đã bị tạm khóa. Hãy liên hệ chủ cửa hàng.');
      }
      if (existing.firebase_uid && existing.firebase_uid !== firebaseUid) {
        throw new ApiError(409, 'firebase_uid_mismatch', 'Tài khoản này đã được liên kết với phương thức đăng nhập khác.');
      }
      await withUser(pool, existing.id, async (client) => {
        const shouldActivate = existing.status === 'pending';
        await client.query(
          `UPDATE users
           SET firebase_uid = COALESCE(firebase_uid, $2),
               email_verified_at = COALESCE(email_verified_at, now()),
               status = CASE WHEN $3::boolean THEN 'active' ELSE status END,
               auth_provider = CASE WHEN auth_provider = 'password' THEN $4 ELSE auth_provider END,
               updated_at = now()
           WHERE id = $1`,
          [existing.id, firebaseUid, shouldActivate, provider]
        );
        if (!existing.email_verified_at) {
          await recordSecurityEvent(client, existing.id, 'email_verified');
        }
        const pendingInvite = await client.query(
          `SELECT id, store_id, role, invited_by FROM store_invitations
           WHERE (claimed_user_id = $1 OR email_normalized = $2)
             AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [existing.id, tokenEmailNormalized]
        );
        if (pendingInvite.rowCount) {
          const invitation = pendingInvite.rows[0];
          await client.query("SELECT set_config('app.store_id', $1, true)", [invitation.store_id]);
          const activeStore = await client.query("SELECT id FROM stores WHERE id = $1 AND status = 'active'", [invitation.store_id]);
          if (activeStore.rowCount) {
            await client.query(
              `INSERT INTO memberships (store_id, user_id, role, status, invited_by, joined_at)
               VALUES ($1, $2, $3, 'active', $4, now())
               ON CONFLICT (store_id, user_id) DO NOTHING`,
              [invitation.store_id, existing.id, invitation.role, invitation.invited_by]
            );
            await client.query(
              'UPDATE store_invitations SET claimed_user_id = COALESCE(claimed_user_id, $2), accepted_at = now(), updated_at = now() WHERE id = $1',
              [invitation.id, existing.id]
            );
            await client.query(
              `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
               VALUES ($1, $2, 'staff.joined', 'store_invitation', $3, $4::jsonb)`,
              [invitation.store_id, existing.id, invitation.id, JSON.stringify({ role: invitation.role, acceptedDuring: 'firebase_login' })]
            );
          }
        }
      });
      return createUserSession(pool, existing.id, reply, env, { activatePendingOwner: true });
    }

    if (body.completeOnboarding !== true) {
      return {
        status: 'onboarding_required',
        profile: {
          provider,
          displayName: tokenName,
          email: tokenEmail,
        },
      };
    }

    const displayName = typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim()
      : tokenName;
    const workspaceMode = body.workspaceMode === undefined ? 'shop' : body.workspaceMode;
    if (!['shop', 'affiliate'].includes(workspaceMode)) {
      throw new ApiError(400, 'validation_error', 'Chọn Chủ shop hoặc Affiliate.');
    }
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';
    if (displayName.length < 2 || displayName.length > 120 || (workspaceMode === 'shop' && (storeName.length < 2 || storeName.length > 160))) {
      throw new ApiError(400, 'validation_error', 'Hãy nhập tên của bạn (tối thiểu 2 ký tự) và tên cửa hàng.');
    }

    const { randomUUID } = require('node:crypto');
    const userId = randomUUID();
    const storeId = randomUUID();
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));

    try {
      await withUser(pool, userId, async (client) => {
        await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
        await client.query(
          `INSERT INTO users (
             id, email, email_normalized, display_name, password_hash,
             status, email_verified_at, workspace_mode, firebase_uid, auth_provider
           )
           VALUES ($1, $2, $3, $4, $5, 'active', now(), $6, $7, $8)`,
          [userId, tokenEmail, tokenEmailNormalized, displayName, passwordHash, workspaceMode, firebaseUid, provider]
        );
        if (workspaceMode === 'shop') {
          await client.query('INSERT INTO stores (id, name) VALUES ($1, $2)', [storeId, storeName]);
          await client.query(
            `INSERT INTO memberships (store_id, user_id, role, status, joined_at)
             VALUES ($1, $2, 'owner', 'active', now())`,
            [storeId, userId]
          );
          await client.query('INSERT INTO store_sequences (store_id) VALUES ($1)', [storeId]);
        }
      });
    } catch (error) {
      if (error.code === '23505') {
        throw new ApiError(409, 'account_exists', 'Email này đã được sử dụng.');
      }
      throw error;
    }

    const session = await createUserSession(pool, userId, reply, env);
    reply.code(201);
    return {
      ...session,
      status: 'created_via_firebase',
      message: 'Đã khởi tạo tài khoản và cửa hàng thành công.',
    };
  });

  app.post('/api/auth/register/prepare', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request) => {
    assertSameOrigin(request, env);
    const body = request.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const emailNormalized = email.toLowerCase();
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const workspaceMode = body.workspaceMode === undefined ? 'shop' : body.workspaceMode;
    if (!['shop', 'affiliate'].includes(workspaceMode)) throw new ApiError(400, 'validation_error', 'Chọn Chủ shop hoặc Affiliate.');
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || displayName.length > 120 || (workspaceMode === 'shop' && (storeName.length < 2 || storeName.length > 160))) {
      throw new ApiError(400, 'validation_error', 'Hãy kiểm tra email, tên và tên cửa hàng.');
    }
    await requireCaptchaIfEnabled(pool, env, body);
    const exists = await pool.query('SELECT 1 FROM users WHERE email_normalized = $1 LIMIT 1', [emailNormalized]);
    if (exists.rowCount) {
      throw new ApiError(409, 'account_exists', 'Email này đã được sử dụng.');
    }
    return {
      ok: true,
      registrationTicket: createRegistrationTicket(env, { emailNormalized }),
    };
  });

  app.post('/api/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    assertSameOrigin(request, env);
    const body = request.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const emailNormalized = email.toLowerCase();
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const workspaceMode = body.workspaceMode === undefined ? 'shop' : body.workspaceMode;
    if (!['shop', 'affiliate'].includes(workspaceMode)) throw new ApiError(400, 'validation_error', 'Chọn Chủ shop hoặc Affiliate.');
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : '';
    const firebaseIdToken = typeof body.firebaseIdToken === 'string' ? body.firebaseIdToken.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || displayName.length > 120 || (workspaceMode === 'shop' && (storeName.length < 2 || storeName.length > 160))) {
      throw new ApiError(400, 'validation_error', 'Hãy kiểm tra email, tên và tên cửa hàng.');
    }

    const usedTicket = verifyRegistrationTicket(env, body.registrationTicket, emailNormalized);
    if (usedTicket) {
      const regPayload = decodeSignedTokenPayload(env, body.registrationTicket);
      if (regPayload?.id) {
        const firstReg = await persistConsumedSecurityTicket(pool, {
          ticketId: `reg:${regPayload.id}`,
          kind: 'registration_ticket',
          metadata: { email: emailNormalized },
          expiresAtMs: regPayload.exp,
        });
        if (!firstReg) {
          throw new ApiError(400, 'captcha_invalid', 'Phiên xác thực đăng ký đã được sử dụng. Vui lòng thử lại.');
        }
      }
    } else {
      await requireCaptchaIfEnabled(pool, env, body);
    }

    const { randomUUID } = require('node:crypto');
    const userId = randomUUID();
    const storeId = randomUUID();

    if (firebaseIdToken) {
      if (!verifier.configured) {
        throw new ApiError(503, 'firebase_auth_unavailable', 'Xác thực Firebase chưa được cấu hình.');
      }
      if (firebaseIdToken.length < 20 || firebaseIdToken.length > 8192) {
        throw new ApiError(400, 'validation_error', 'Mã xác thực Firebase không hợp lệ.');
      }
      let decoded;
      try {
        decoded = await verifier.verifyIdToken(firebaseIdToken);
      } catch {
        throw new ApiError(401, 'invalid_firebase_token', 'Phiên xác thực Firebase không hợp lệ.');
      }
      const firebaseUid = typeof decoded?.uid === 'string' ? decoded.uid.trim() : '';
      const provider = String(decoded?.firebase?.sign_in_provider || '').trim();
      const tokenEmail = typeof decoded?.email === 'string' ? decoded.email.trim().toLowerCase() : '';
      if (!firebaseUid || provider !== 'password' || tokenEmail !== emailNormalized) {
        throw new ApiError(400, 'invalid_firebase_token', 'Tài khoản Firebase không khớp với email đăng ký.');
      }
      const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
      try {
        await withUser(pool, userId, async (client) => {
          await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
          await client.query(
            `INSERT INTO users (id, email, email_normalized, display_name, password_hash, status, workspace_mode, firebase_uid, auth_provider)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, 'password')`,
            [userId, email, emailNormalized, displayName, passwordHash, workspaceMode, firebaseUid]
          );
          if (workspaceMode === 'shop') {
            await client.query('INSERT INTO stores (id, name) VALUES ($1, $2)', [storeId, storeName]);
            await client.query(
              `INSERT INTO memberships (store_id, user_id, role, status, joined_at)
               VALUES ($1, $2, 'owner', 'active', now())`,
              [storeId, userId]
            );
            await client.query('INSERT INTO store_sequences (store_id) VALUES ($1)', [storeId]);
          }
        });
      } catch (error) {
        if (error.code === '23505') throw new ApiError(409, 'account_exists', 'Email này đã được sử dụng.');
        throw error;
      }
      reply.code(201);
      return {
        status: 'verification_required',
        provider: 'firebase',
        email,
        message: 'Tài khoản đã được tạo. Slink đã gửi email xác nhận qua Firebase — hãy bấm liên kết hoặc dán mã xác nhận trong email để kích hoạt cửa hàng.',
      };
    }

    if (password.length < 12 || password.length > 128) {
      throw new ApiError(400, 'validation_error', 'Hãy kiểm tra email, tên, tên cửa hàng và mật khẩu (tối thiểu 12 ký tự).');
    }
    const passwordHash = await hashPassword(password);
    const demoBypass = emailVerificationDisabled(env);
    let verificationToken;
    try {
      verificationToken = await withUser(pool, userId, async (client) => {
        await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
        await client.query(
          `INSERT INTO users (id, email, email_normalized, display_name, password_hash, status, workspace_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, email, emailNormalized, displayName, passwordHash, demoBypass ? 'active' : 'pending', workspaceMode]
        );
        if (workspaceMode === 'shop') {
        await client.query('INSERT INTO stores (id, name) VALUES ($1, $2)', [storeId, storeName]);
        await client.query(
          `INSERT INTO memberships (store_id, user_id, role, status, joined_at)
           VALUES ($1, $2, 'owner', 'active', now())`,
          [storeId, userId]
        );
        await client.query('INSERT INTO store_sequences (store_id) VALUES ($1)', [storeId]);
        }
        return demoBypass ? null : recordVerificationToken(client, userId);
      });
    } catch (error) {
      if (error.code === '23505') throw new ApiError(409, 'account_exists', 'Email này đã được sử dụng.');
      throw error;
    }
    if (demoBypass) {
      const session = await createUserSession(pool, userId, reply, env);
      reply.code(201);
      return {
        ...session,
        status: 'created_without_email_verification',
        message: 'Đã tạo tài khoản và đăng nhập.',
      };
    }
    const publicOrigin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000';
    const verificationUrl = new URL('/verify', publicOrigin);
    verificationUrl.hash = new URLSearchParams({ token: verificationToken }).toString();
    const delivery = await sendVerification(env, email, verificationUrl.toString());
    reply.code(201);
    return {
      status: 'verification_required',
      message: 'Tài khoản đã được tạo. Hãy mở liên kết xác nhận trong email để tiếp tục.',
      ...(delivery.developmentUrl ? { developmentVerificationUrl: delivery.developmentUrl } : {}),
    };
  });

  app.post('/api/auth/verify-email', async (request) => {
    assertSameOrigin(request, env);
    const token = request.body?.token;
    if (typeof token !== 'string' || token.length > 128) throw new ApiError(400, 'invalid_token', 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.');
    const tokenDigest = digest(token);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, user_id FROM email_verification_tokens
         WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenDigest]
      );
      if (!found.rowCount) throw new ApiError(400, 'invalid_token', 'Liên kết xác nhận không hợp lệ hoặc đã hết hạn.');
      await client.query("SELECT set_config('app.user_id', $1, true)", [found.rows[0].user_id]);
      await client.query('UPDATE email_verification_tokens SET consumed_at = now() WHERE id = $1', [found.rows[0].id]);
      const activated = await client.query(
        "UPDATE users SET email_verified_at = now(), status = 'active', updated_at = now() WHERE id = $1 AND status IN ('pending', 'active') AND email_verified_at IS NULL RETURNING id",
        [found.rows[0].user_id]
      );
      if (!activated.rowCount) throw new ApiError(409, 'account_not_pending', 'Tài khoản không còn chờ xác nhận email. Hãy đăng nhập hoặc liên hệ hỗ trợ.');
      await recordSecurityEvent(client, found.rows[0].user_id, 'email_verified');
      const claimed = await client.query(
        `SELECT id, store_id, role, invited_by FROM store_invitations
         WHERE claimed_user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [found.rows[0].user_id]
      );
      let joinedStore = false;
      if (claimed.rowCount) {
        const invitation = claimed.rows[0];
        await client.query("SELECT set_config('app.store_id', $1, true)", [invitation.store_id]);
        const activeStore = await client.query("SELECT id FROM stores WHERE id = $1 AND status = 'active'", [invitation.store_id]);
        if (activeStore.rowCount) {
          await client.query(
            `INSERT INTO memberships (store_id, user_id, role, status, invited_by, joined_at)
             VALUES ($1, $2, $3, 'active', $4, now())`,
            [invitation.store_id, found.rows[0].user_id, invitation.role, invitation.invited_by]
          );
          await client.query('UPDATE store_invitations SET accepted_at = now(), updated_at = now() WHERE id = $1', [invitation.id]);
          await client.query(
            `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'staff.joined', 'store_invitation', $3, $4::jsonb)`,
            [invitation.store_id, found.rows[0].user_id, invitation.id, JSON.stringify({ role: invitation.role, acceptedDuring: 'email_verification' })]
          );
          joinedStore = true;
        }
      }
      await client.query('COMMIT');
      return { status: 'verified', message: joinedStore ? 'Email đã xác nhận. Bạn đã được thêm vào cửa hàng; hãy đăng nhập để tiếp tục.' : 'Email đã được xác nhận. Bạn có thể đăng nhập.' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/resend-verification', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request) => {
    assertSameOrigin(request, env);
    await requireCaptchaIfEnabled(pool, env, request.body || {});
    if (emailVerificationDisabled(env)) {
      return {
        status: 'verification_not_required',
        message: 'Tài khoản môi trường kiểm thử không cần xác minh email.',
      };
    }
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254) throw new ApiError(400, 'validation_error', 'Email không hợp lệ.');
    const found = await pool.query(
      `SELECT id, email, display_name, firebase_uid FROM users WHERE email_normalized = $1 AND status IN ('pending', 'active') AND email_verified_at IS NULL`,
      [email]
    );
    if (verifier.configured) {
      if (found.rowCount && !found.rows[0].firebase_uid && typeof verifier.ensureUser === 'function') {
        try {
          const fbUser = await verifier.ensureUser({
            email: found.rows[0].email,
            displayName: found.rows[0].display_name,
            emailVerified: false,
          });
          if (fbUser?.uid) {
            await withUser(pool, found.rows[0].id, (client) => client.query(
              'UPDATE users SET firebase_uid = COALESCE(firebase_uid, $2), updated_at = now() WHERE id = $1',
              [found.rows[0].id, fbUser.uid]
            ));
          }
        } catch (error) {
          request.log.warn({ err: error.message }, 'Firebase user provisioning failed on resend verification');
        }
      }
      return {
        status: 'verification_requested',
        provider: 'firebase',
        message: 'Nếu tài khoản chưa xác minh tồn tại, Slink sẽ gửi lại email xác nhận qua Firebase.',
      };
    }
    let delivery;
    if (found.rowCount) {
      const token = await withUser(pool, found.rows[0].id, (client) => recordVerificationToken(client, found.rows[0].id));
      const verificationUrl = new URL('/verify', env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000');
      verificationUrl.hash = new URLSearchParams({ token }).toString();
      try {
        delivery = await sendVerification(env, found.rows[0].email, verificationUrl.toString());
      } catch (error) {
        request.log.warn({ code: error.code || 'email_unavailable', ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) }, 'Verification email delivery failed');
      }
    }
    return {
      status: 'verification_requested',
      message: 'Nếu tài khoản cần xác nhận tồn tại, Slink sẽ gửi liên kết mới.',
      ...(delivery?.developmentUrl ? { developmentVerificationUrl: delivery.developmentUrl } : {}),
    };
  });

  app.post('/api/auth/password-reset', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request) => {
    assertSameOrigin(request, env);
    await requireCaptchaIfEnabled(pool, env, request.body || {});
    const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
    const emailNormalized = email.toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'validation_error', 'Email không hợp lệ.');
    const found = await pool.query(
      `SELECT id, email, display_name, firebase_uid FROM users WHERE email_normalized = $1 AND status = 'active' AND email_verified_at IS NOT NULL`,
      [emailNormalized]
    );
    let delivery;
    if (found.rowCount) {
      const row = found.rows[0];
      const publicOrigin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000';
      if (verifier.configured && typeof verifier.sendPasswordResetEmail === 'function') {
        try {
          if (!row.firebase_uid && typeof verifier.ensureUser === 'function') {
            const fbUser = await verifier.ensureUser({ email: row.email, displayName: row.display_name, emailVerified: true });
            if (fbUser?.uid) {
              await withUser(pool, row.id, (client) => client.query(
                'UPDATE users SET firebase_uid = COALESCE(firebase_uid, $2), updated_at = now() WHERE id = $1',
                [row.id, fbUser.uid]
              ));
            }
          }
          await verifier.sendPasswordResetEmail(row.email, `${publicOrigin}/?mode=resetPassword`);
        } catch (error) {
          request.log.warn({ code: error.code || 'firebase_reset_failed', ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) }, 'Firebase password reset email delivery failed');
        }
      } else {
        const userId = row.id;
        const token = newToken();
        await withUser(pool, userId, async (client) => {
          await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
          await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL', [userId]);
          await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_digest, expires_at)
             VALUES ($1, $2, now() + ($3::text || ' hours')::interval)`,
            [userId, digest(token), PASSWORD_RESET_HOURS]
          );
        });
        const resetUrl = new URL('/', publicOrigin);
        resetUrl.hash = new URLSearchParams({ reset: token }).toString();
        try {
          delivery = await sendPasswordReset(env, row.email, resetUrl.toString());
        } catch (error) {
          request.log.warn({ code: error.code || 'email_unavailable', ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) }, 'Password reset email delivery failed');
        }
      }
    }
    return {
      status: 'password_reset_requested',
      message: 'Nếu tài khoản đã xác nhận email tồn tại, Slink sẽ gửi liên kết và mã đặt lại mật khẩu.',
      ...(delivery?.developmentUrl ? { developmentResetUrl: delivery.developmentUrl } : {}),
    };
  });

  app.post('/api/auth/password-reset/complete', {
    config: { rateLimit: { max: 8, timeWindow: '1 hour' } },
  }, async (request) => {
    assertSameOrigin(request, env);
    const token = request.body?.token;
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw new ApiError(400, 'invalid_token', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    if (password.length < 12 || password.length > 128) throw new ApiError(400, 'validation_error', 'Mật khẩu mới cần từ 12 đến 128 ký tự.');
    const tokenDigest = digest(token);
    const validToken = await pool.query(
      `SELECT id FROM password_reset_tokens WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > now()`,
      [tokenDigest]
    );
    if (!validToken.rowCount) throw new ApiError(400, 'invalid_token', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenDigest]
      );
      if (!found.rowCount) throw new ApiError(400, 'invalid_token', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
      const userId = found.rows[0].user_id;
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      await client.query('UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1', [found.rows[0].id]);
      const updated = await client.query(
        `UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'active' AND email_verified_at IS NOT NULL RETURNING id, firebase_uid`,
        [userId, passwordHash]
      );
      if (!updated.rowCount) throw new ApiError(400, 'invalid_token', 'Tài khoản không còn hoạt động. Hãy liên hệ quản lý.');
      await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await recordSecurityEvent(client, userId, 'password_changed');
      await client.query('COMMIT');
      const firebaseUid = updated.rows[0].firebase_uid;
      if (firebaseUid && verifier.configured && typeof verifier.revokeRefreshTokens === 'function') {
        await verifier.revokeRefreshTokens(firebaseUid).catch(() => {});
      }
      return { status: 'password_changed', message: 'Mật khẩu đã được cập nhật. Đăng nhập lại bằng mật khẩu mới.' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/auth/change-password/request', {
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
  }, async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const found = await pool.query(
      'SELECT id, email, display_name, firebase_uid, status FROM users WHERE id = $1 LIMIT 1',
      [auth.userId]
    );
    if (!found.rowCount || found.rows[0].status !== 'active') {
      throw new ApiError(401, 'unauthorized', 'Phiên đăng nhập không còn hợp lệ.');
    }
    const user = found.rows[0];
    const publicOrigin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000';
    if (verifier.configured && typeof verifier.sendPasswordResetEmail === 'function') {
      try {
        if (!user.firebase_uid && typeof verifier.ensureUser === 'function') {
          const fbUser = await verifier.ensureUser({ email: user.email, displayName: user.display_name, emailVerified: true });
          if (fbUser?.uid) {
            await withUser(pool, user.id, (client) => client.query(
              'UPDATE users SET firebase_uid = COALESCE(firebase_uid, $2), updated_at = now() WHERE id = $1',
              [user.id, fbUser.uid]
            ));
          }
        }
        await verifier.sendPasswordResetEmail(user.email, `${publicOrigin}/?mode=resetPassword`);
      } catch (error) {
        request.log.warn({ code: error.code || 'firebase_reset_failed', ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) }, 'Failed sending Firebase change-password confirmation email');
        throw new ApiError(503, 'email_unavailable', 'Chưa thể gửi email xác nhận đổi mật khẩu. Vui lòng thử lại sau.');
      }
      await persistConsumedSecurityTicket(pool, {
        ticketId: `pwchgreq:${require('node:crypto').randomUUID()}`,
        kind: 'password_change_request',
        userId: user.id,
        expiresAtMs: Date.now() + 60 * 60 * 1000,
      });
      return {
        status: 'confirmation_email_sent',
        provider: 'firebase',
        email: user.email,
        message: `Đã gửi email xác nhận đổi mật khẩu tới ${user.email}. Hãy mở liên kết hoặc dán mã xác nhận từ email vào khung bên dưới.`,
      };
    }

    const token = newToken();
    await withUser(pool, user.id, async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_digest, expires_at)
         VALUES ($1, $2, now() + ($3::text || ' hours')::interval)`,
        [user.id, digest(token), PASSWORD_RESET_HOURS]
      );
    });
    const resetUrl = new URL('/', publicOrigin);
    resetUrl.hash = new URLSearchParams({ reset: token }).toString();
    const delivery = await sendPasswordReset(env, user.email, resetUrl.toString());
    return {
      status: 'confirmation_email_sent',
      provider: 'email',
      email: user.email,
      message: `Đã gửi email xác nhận đổi mật khẩu tới ${user.email}. Hãy dán mã hoặc liên kết trong email vào khung bên dưới.`,
      ...(delivery?.developmentUrl ? { developmentResetUrl: delivery.developmentUrl } : {}),
    };
  });

  app.post('/api/auth/change-password/confirm', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    if (!verifier.configured) {
      throw new ApiError(503, 'firebase_auth_unavailable', 'Xác thực Firebase chưa được cấu hình.');
    }
    const idToken = typeof request.body?.idToken === 'string' ? request.body.idToken.trim() : '';
    if (!idToken || idToken.length < 20 || idToken.length > 8192) {
      throw new ApiError(400, 'validation_error', 'Mã xác thực Firebase không hợp lệ.');
    }
    let decoded;
    try {
      decoded = await verifier.verifyIdToken(idToken);
    } catch {
      throw new ApiError(401, 'invalid_firebase_token', 'Phiên xác nhận mật khẩu không hợp lệ hoặc đã hết hạn.');
    }
    const firebaseUid = typeof decoded?.uid === 'string' ? decoded.uid.trim() : '';
    const tokenEmail = typeof decoded?.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    const authTimeSec = Number(decoded?.auth_time);
    if (!firebaseUid || !decoded?.email_verified || tokenEmail !== auth.email.toLowerCase()) {
      throw new ApiError(403, 'email_mismatch', 'Tài khoản xác nhận không khớp với email đang đăng nhập.');
    }
    if (!Number.isFinite(authTimeSec) || Math.floor(Date.now() / 1000) - authTimeSec > 600) {
      throw new ApiError(401, 'stale_authentication', 'Xác nhận đã quá hạn. Hãy thực hiện xác nhận qua email lại.');
    }
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    await withUser(pool, auth.userId, async (client) => {
      const user = await client.query('SELECT status, firebase_uid FROM users WHERE id = $1 FOR UPDATE', [auth.userId]);
      if (!user.rowCount || user.rows[0].status !== 'active') {
        throw new ApiError(401, 'unauthorized', 'Phiên đăng nhập không còn hợp lệ.');
      }
      if (user.rows[0].firebase_uid && user.rows[0].firebase_uid !== firebaseUid) {
        throw new ApiError(409, 'firebase_uid_mismatch', 'Tài khoản không khớp với định danh Firebase đã liên kết.');
      }
      const reqEvt = await client.query(
        `SELECT ticket_id FROM consumed_security_tickets
         WHERE user_id = $1 AND kind = 'password_change_request'
           AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [auth.userId]
      );
      if (!reqEvt.rowCount) {
        throw new ApiError(409, 'password_change_not_requested', 'Chưa có yêu cầu đổi mật khẩu qua email gần đây. Hãy bấm Gửi email xác nhận trước.');
      }
      await client.query('DELETE FROM consumed_security_tickets WHERE ticket_id = $1', [reqEvt.rows[0].ticket_id]);
      const firstConfirm = await persistConsumedSecurityTicket(client, {
        ticketId: `pwchg:${auth.userId}:${authTimeSec}`,
        kind: 'password_change_confirm',
        userId: auth.userId,
        expiresAtMs: Date.now() + 3600_000,
      });
      if (!firstConfirm) {
        throw new ApiError(409, 'confirmation_already_used', 'Phiên xác nhận đổi mật khẩu này đã được sử dụng. Hãy gửi lại email xác nhận.');
      }
      await client.query(
        `UPDATE users
         SET password_hash = $2,
             firebase_uid = COALESCE(firebase_uid, $3),
             email_verified_at = COALESCE(email_verified_at, now()),
             password_changed_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [auth.userId, passwordHash, firebaseUid]
      );
      await client.query(
        'UPDATE password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL',
        [auth.userId]
      );
      await client.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND token_digest <> $2 AND revoked_at IS NULL',
        [auth.userId, auth.tokenDigest]
      );
      await recordSecurityEvent(client, auth.userId, 'password_changed');
    });
    if (verifier.configured && typeof verifier.revokeRefreshTokens === 'function') {
      await verifier.revokeRefreshTokens(firebaseUid).catch(() => {});
    }
    return { status: 'password_changed', message: 'Đã xác nhận qua email và đổi mật khẩu thành công. Các thiết bị khác cần đăng nhập lại.' };
  });

  app.post('/api/auth/change-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    if (env.NODE_ENV === 'production' || (verifier.configured && env.ALLOW_DIRECT_PASSWORD_CHANGE !== 'true')) {
      throw new ApiError(403, 'email_confirmation_required', 'Đổi mật khẩu yêu cầu xác nhận qua email. Hãy dùng nút Gửi email xác nhận đổi mật khẩu.');
    }
    const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';
    const newPassword = typeof request.body?.newPassword === 'string' ? request.body.newPassword : '';
    if (!currentPassword || currentPassword.length > 128) throw new ApiError(400, 'validation_error', 'Hãy nhập mật khẩu hiện tại.');
    if (newPassword.length < 12 || newPassword.length > 128) throw new ApiError(400, 'validation_error', 'Mật khẩu mới cần từ 12 đến 128 ký tự.');
    let fbUid = null;
    await withUser(pool, auth.userId, async (client) => {
      const user = await client.query('SELECT password_hash, status, firebase_uid FROM users WHERE id = $1 FOR UPDATE', [auth.userId]);
      if (!user.rowCount || user.rows[0].status !== 'active') throw new ApiError(401, 'unauthorized', 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.');
      fbUid = user.rows[0].firebase_uid;
      if (!await verifyPassword(currentPassword, user.rows[0].password_hash)) {
        throw new ApiError(400, 'current_password_invalid', 'Mật khẩu hiện tại chưa đúng.');
      }
      if (await verifyPassword(newPassword, user.rows[0].password_hash)) {
        throw new ApiError(400, 'validation_error', 'Mật khẩu mới cần khác mật khẩu hiện tại.');
      }
      const passwordHash = await hashPassword(newPassword);
      await client.query(
        'UPDATE users SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1',
        [auth.userId, passwordHash]
      );
      await client.query(
        'UPDATE password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL',
        [auth.userId]
      );
      await client.query(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND token_digest <> $2 AND revoked_at IS NULL',
        [auth.userId, auth.tokenDigest]
      );
      await recordSecurityEvent(client, auth.userId, 'password_changed');
    });
    if (fbUid && verifier.configured && typeof verifier.revokeRefreshTokens === 'function') {
      await verifier.revokeRefreshTokens(fbUid).catch(() => {});
    }
    return { status: 'password_changed', message: 'Đã đổi mật khẩu. Các thiết bị khác cần đăng nhập lại.' };
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    assertSameOrigin(request, env);
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!email || email.length > 254 || !password || password.length > 128) throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
    const demoBypass = emailVerificationDisabled(env);
    const found = await pool.query(
      `SELECT id, email, display_name, password_hash, status, email_verified_at, firebase_uid FROM users
       WHERE email_normalized = $1 AND status IN ('active', 'pending')`,
      [email]
    );
    const candidate = found.rows[0];
    if (candidate && candidate.firebase_uid && verifier.configured) {
      await verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
    }
    const encoded = found.rowCount ? candidate.password_hash : DUMMY_PASSWORD_HASH;
    const passwordMatches = await verifyPassword(password, encoded);
    if (!found.rowCount || !passwordMatches) {
      if (found.rowCount) {
        await withUser(pool, candidate.id, (client) => recordSecurityEvent(client, candidate.id, 'login_failed'));
      }
      throw new ApiError(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.');
    }
    const user = candidate;
    if (!user.email_verified_at && !demoBypass) {
      if (verifier.configured && typeof verifier.ensureUser === 'function') {
        try {
          await verifier.ensureUser({ email: user.email, displayName: user.display_name, emailVerified: false, password });
        } catch (err) {
          request.log.warn({ err: err.message }, 'Firebase provisioning failed during unverified login');
        }
      }
      throw new ApiError(401, 'email_verification_required', 'Tài khoản này chưa xác minh email. Hãy xác nhận email trước khi đăng nhập.');
    }
    if (user.email_verified_at && !user.firebase_uid && verifier.configured && typeof verifier.ensureUser === 'function') {
      try {
        const fbUser = await verifier.ensureUser({ email: user.email, displayName: user.display_name, emailVerified: true, password });
        if (fbUser?.uid) {
          await withUser(pool, user.id, (client) => client.query(
            'UPDATE users SET firebase_uid = COALESCE(firebase_uid, $2), updated_at = now() WHERE id = $1',
            [user.id, fbUser.uid]
          ));
        }
      } catch (err) {
        request.log.warn({ err: err.message }, 'Best-effort Firebase sync failed during legacy login');
      }
    }
    return createUserSession(pool, user.id, reply, env, { activatePendingOwner: demoBypass && user.status === 'pending' });
  });

  app.get('/api/auth/me', async (request) => {
    const auth = await authenticate(pool, request);
    const stores = await listStores(pool, auth.userId);
    return { user: { id: auth.userId, email: auth.email, displayName: auth.displayName, workspaceMode: auth.workspaceMode }, stores };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    await withUser(pool, auth.userId, async (client) => {
      const session = await client.query(
        'UPDATE sessions SET revoked_at = now() WHERE token_digest = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
        [auth.tokenDigest, auth.userId]
      );
      if (session.rowCount) await recordSecurityEvent(client, auth.userId, 'logout', session.rows[0].id);
    });
    clearSessionCookies(reply, env);
    return { status: 'signed_out' };
  });

  app.get('/api/stores', async (request) => {
    const auth = await authenticate(pool, request);
    return { stores: await listStores(pool, auth.userId) };
  });
}

module.exports = {
  ApiError,
  authenticate,
  assertSameOrigin,
  digest,
  deliverEmail,
  emailVerificationDisabled,
  createUserSession,
  hashPassword,
  newToken,
  registerAuthRoutes,
  requireCsrf,
  setSessionCookies,
  sendVerification,
  verifyPassword,
};
