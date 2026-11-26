'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer, validateProductionConfig } = require('../index');
const { createCaptchaChallengeWithAnswer, verifyCaptchaChallenge } = require('../captcha');
const { createPGlitePool } = require('../pglite-test-pool');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : (response.headers['set-cookie'] ? [response.headers['set-cookie']] : []);
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
}

async function createAuthTestApp(t, { env = {}, firebaseVerifier = null } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'));
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    REVOKE ALL ON public.product_sale_price_history FROM slink_app;
    GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({
    pool,
    logger: false,
    firebaseVerifier,
    env: {
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: origin,
      ...env,
    },
  });
  app.testDb = db;
  t.after(() => app.close());
  return app;
}

test('GET /api/auth/captcha returns no-store distorted SVG without leaking answer and enforces single-use burn', async (t) => {
  const app = await createAuthTestApp(t, { env: { REQUIRE_AUTH_CAPTCHA: 'true' } });
  const res = await app.inject({ method: 'GET', url: '/api/auth/captcha' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const body = res.json();
  assert.ok(typeof body.captchaToken === 'string' && body.captchaToken.includes('.'));
  assert.match(body.imageDataUrl, /^data:image\/svg\+xml;base64,/);
  assert.equal(body.expiresInSeconds, 300);
  assert.equal(body._answer, undefined);
  assert.equal(body.answer, undefined);

  const svgXml = Buffer.from(body.imageDataUrl.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf8');
  assert.ok(svgXml.includes('<svg') && svgXml.includes('<text') && svgXml.includes('transform="rotate('));

  const wrongTry = createCaptchaChallengeWithAnswer({ NODE_ENV: 'test' });
  assert.equal(verifyCaptchaChallenge({ NODE_ENV: 'test' }, wrongTry.captchaToken, 'WRONG1'), false);
  // Replay of correct answer after one failed guess must still fail (single-use burn).
  assert.equal(verifyCaptchaChallenge({ NODE_ENV: 'test' }, wrongTry.captchaToken, wrongTry._answer), false);

  const goodTry = createCaptchaChallengeWithAnswer({ NODE_ENV: 'test' });
  assert.equal(verifyCaptchaChallenge({ NODE_ENV: 'test' }, goodTry.captchaToken, goodTry._answer.toLowerCase()), true);
  // Replay of already-used valid challenge must fail.
  assert.equal(verifyCaptchaChallenge({ NODE_ENV: 'test' }, goodTry.captchaToken, goodTry._answer), false);
});

test('validateProductionConfig accepts Firebase Auth without EMAIL_DELIVERY_URL and rejects missing verification config', () => {
  const baseProd = {
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://slink_app:secret@db.example.com:5432/slink',
    PG_SSL: 'true',
    PUBLIC_ORIGIN: 'https://slink-xny3.onrender.com',
  };
  assert.throws(
    () => validateProductionConfig({ ...baseProd, DEMO_DISABLE_EMAIL_VERIFICATION: 'true' }),
    /Firebase Auth configuration or valid EMAIL_DELIVERY_URL/
  );
  assert.doesNotThrow(() => validateProductionConfig({
    ...baseProd,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      project_id: 'slink-ad8be',
      client_email: 'fb@slink-ad8be.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
    }),
    FIREBASE_WEB_API_KEY: 'AIzaTestKey123',
    FIREBASE_AUTH_DOMAIN: 'slink-ad8be.firebaseapp.com',
    FIREBASE_PROJECT_ID: 'slink-ad8be',
    FIREBASE_APP_ID: '1:709175319490:web:test123',
  }));
});

test('Firebase registration enforces CAPTCHA, blocks unverified login, activates after verification, and rejects stale local password', async (t) => {
  const fbEnv = {
    REQUIRE_AUTH_CAPTCHA: 'true',
    FIREBASE_WEB_API_KEY: 'AIzaTestKey',
    FIREBASE_AUTH_DOMAIN: 'slink-ad8be.firebaseapp.com',
    FIREBASE_PROJECT_ID: 'slink-ad8be',
    FIREBASE_APP_ID: '1:709175319490:web:test',
  };
  const tokenMap = {
    'fb-unverified-reg-token-001': {
      uid: 'fb-uid-reg-1',
      email: 'newowner@shop.vn',
      email_verified: false,
      firebase: { sign_in_provider: 'password' },
    },
    'fb-verified-reg-token-002': {
      uid: 'fb-uid-reg-1',
      email: 'newowner@shop.vn',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    },
  };
  const app = await createAuthTestApp(t, {
    env: fbEnv,
    firebaseVerifier: async (token) => {
      if (!Object.hasOwn(tokenMap, token)) throw new Error('invalid');
      return tokenMap[token];
    },
  });

  const policy = await app.inject({ method: 'GET', url: '/api/auth/policy' });
  assert.equal(policy.statusCode, 200);
  assert.deepEqual(policy.json(), {
    emailVerificationRequired: true,
    captchaRequired: true,
    firebaseEnabled: true,
    passwordChangeRequiresEmail: true,
  });

  const badCaptcha = await app.inject({
    method: 'POST',
    url: '/api/auth/register/prepare',
    headers: { origin },
    payload: {
      displayName: 'Lan',
      storeName: 'Tiệm Lan',
      email: 'newowner@shop.vn',
      captchaToken: 'bad.token',
      captchaAnswer: '123456',
    },
  });
  assert.equal(badCaptcha.statusCode, 400);
  assert.equal(badCaptcha.json().error.code, 'captcha_invalid');

  const challenge = createCaptchaChallengeWithAnswer({ ...fbEnv, NODE_ENV: 'test' });
  const prep = await app.inject({
    method: 'POST',
    url: '/api/auth/register/prepare',
    headers: { origin },
    payload: {
      displayName: 'Lan',
      storeName: 'Tiệm Lan',
      email: 'newowner@shop.vn',
      captchaToken: challenge.captchaToken,
      captchaAnswer: challenge._answer,
    },
  });
  assert.equal(prep.statusCode, 200, prep.body);
  assert.ok(prep.json().registrationTicket);

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Lan',
      storeName: 'Tiệm Lan',
      email: 'newowner@shop.vn',
      firebaseIdToken: 'fb-unverified-reg-token-001',
      registrationTicket: prep.json().registrationTicket,
    },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  assert.equal(reg.json().status, 'verification_required');
  assert.equal(reg.json().provider, 'firebase');

  // Cannot log in before email_verified === true.
  const beforeVerify = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'fb-unverified-reg-token-001' },
  });
  assert.equal(beforeVerify.statusCode, 403);
  assert.equal(beforeVerify.json().error.code, 'email_not_verified');

  // Legacy password endpoint must not allow password auth once firebase_uid is set.
  const staleLocal = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'newowner@shop.vn', password: 'AnyPassword12345' },
  });
  assert.equal(staleLocal.statusCode, 401);

  // Activate after email verification.
  const afterVerify = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'fb-verified-reg-token-002' },
  });
  assert.equal(afterVerify.statusCode, 200, afterVerify.body);
  assert.equal(afterVerify.json().stores[0].name, 'Tiệm Lan');
  const events = (await app.testDb.query(`SELECT event_type FROM user_security_events ORDER BY occurred_at ASC`)).rows;
  assert.ok(events.some((e) => e.event_type === 'email_verified'));
});

test('Legacy unverified login returns 403 email_verification_required and password change requires email confirmation', async (t) => {
  const sentResetEmails = [];
  const provisionedUsers = [];
  const tokenMap = {
    'fb-legacy-verified-001': {
      uid: 'fb-legacy-uid-1',
      email: 'legacy@shop.vn',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    },
    'fb-fresh-pw-change-002': {
      uid: 'fb-legacy-uid-1',
      email: 'legacy@shop.vn',
      email_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
      firebase: { sign_in_provider: 'password' },
    },
  };
  const app = await createAuthTestApp(t, {
    firebaseVerifier: {
      verifyIdToken: async (tok) => {
        if (!Object.hasOwn(tokenMap, tok)) throw new Error('bad_token');
        return tokenMap[tok];
      },
      ensureUser: async (details) => {
        provisionedUsers.push(details.email);
        return { uid: 'fb-legacy-uid-1', email: details.email, emailVerified: details.emailVerified };
      },
      sendPasswordResetEmail: async (email) => {
        sentResetEmails.push(email);
        return { sent: true };
      },
    },
  });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Minh',
      storeName: 'Cửa hàng Minh',
      email: 'legacy@shop.vn',
      password: 'LegacyStrongPassword#1',
    },
  });
  assert.equal(reg.statusCode, 201);

  // Unverified legacy login must return 401 email_verification_required (not bypassed!).
  const unverifiedLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'legacy@shop.vn', password: 'LegacyStrongPassword#1' },
  });
  assert.equal(unverifiedLogin.statusCode, 401);
  assert.equal(unverifiedLogin.json().error.code, 'email_verification_required');
  assert.ok(provisionedUsers.includes('legacy@shop.vn'));

  // Session 1 & Session 2 via Firebase after verification.
  const s1 = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'fb-legacy-verified-001' },
  });
  assert.equal(s1.statusCode, 200);
  const c1 = cookiesFrom(s1);
  const h1 = { origin, cookie: cookieHeader(c1), 'x-csrf-token': c1.slink_csrf };

  const s2 = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'fb-legacy-verified-001' },
  });
  const c2 = cookiesFrom(s2);
  const h2 = { origin, cookie: cookieHeader(c2), 'x-csrf-token': c2.slink_csrf };

  // Direct change-password is blocked when Firebase is enabled.
  const directBlocked = await app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: h1,
    payload: { currentPassword: 'LegacyStrongPassword#1', newPassword: 'NewStrongPassword#2' },
  });
  assert.equal(directBlocked.statusCode, 403);
  assert.equal(directBlocked.json().error.code, 'email_confirmation_required');

  // Step 1: Request email confirmation for password change.
  const reqEmail = await app.inject({
    method: 'POST',
    url: '/api/auth/change-password/request',
    headers: h1,
    payload: {},
  });
  assert.equal(reqEmail.statusCode, 200, reqEmail.body);
  assert.equal(reqEmail.json().status, 'confirmation_email_sent');
  assert.deepEqual(sentResetEmails, ['legacy@shop.vn']);

  // Step 2: Confirm password change with fresh verified idToken.
  const confirm = await app.inject({
    method: 'POST',
    url: '/api/auth/change-password/confirm',
    headers: h1,
    payload: { idToken: 'fb-fresh-pw-change-002' },
  });
  assert.equal(confirm.statusCode, 200, confirm.body);
  assert.equal(confirm.json().status, 'password_changed');

  // Current session stays valid while other session (h2) is revoked.
  const me1 = await app.inject({ method: 'GET', url: '/api/auth/me', headers: h1 });
  assert.equal(me1.statusCode, 200);
  const me2 = await app.inject({ method: 'GET', url: '/api/auth/me', headers: h2 });
  assert.equal(me2.statusCode, 401);
});
