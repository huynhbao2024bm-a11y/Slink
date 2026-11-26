'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
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

async function createFirebaseTestApp(t, { env = {}, tokenMap = {} } = {}) {
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
  const firebaseVerifier = async (idToken) => {
    if (!Object.hasOwn(tokenMap, idToken)) {
      throw new Error('invalid_token');
    }
    return tokenMap[idToken];
  };
  const app = await buildServer({
    pool,
    logger: false,
    firebaseVerifier: Object.keys(tokenMap).length ? firebaseVerifier : null,
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

test('GET /api/auth/firebase/config enforces no-store, omits phone/secrets, and reports enabled:false when unconfigured', async (t) => {
  const unconfigured = await createFirebaseTestApp(t);
  const offRes = await unconfigured.inject({ method: 'GET', url: '/api/auth/firebase/config' });
  assert.equal(offRes.statusCode, 200);
  assert.equal(offRes.headers['cache-control'], 'no-store');
  assert.deepEqual(offRes.json(), { enabled: false });

  const configured = await createFirebaseTestApp(t, {
    tokenMap: { 'valid-token-placeholder-0001': { uid: 'u1' } },
    env: {
      FIREBASE_WEB_API_KEY: 'AIzaTestKey',
      FIREBASE_AUTH_DOMAIN: 'slink-ad8be.firebaseapp.com',
      FIREBASE_PROJECT_ID: 'slink-ad8be',
      FIREBASE_STORAGE_BUCKET: 'slink-ad8be.firebasestorage.app',
      FIREBASE_MESSAGING_SENDER_ID: '709175319490',
      FIREBASE_APP_ID: '1:709175319490:web:test',
      FIREBASE_PRIVATE_KEY: 'SECRET_SHOULD_NEVER_LEAK',
    },
  });
  const onRes = await configured.inject({ method: 'GET', url: '/api/auth/firebase/config' });
  assert.equal(onRes.statusCode, 200);
  assert.equal(onRes.headers['cache-control'], 'no-store');
  const body = onRes.json();
  assert.equal(body.enabled, true);
  assert.equal(body.projectId, 'slink-ad8be');
  assert.deepEqual(body.providers, { google: true, emailPassword: true });
  assert.ok(!('phone' in body.providers));
  assert.ok(!JSON.stringify(body).includes('SECRET_SHOULD_NEVER_LEAK'));
});

test('POST /api/auth/firebase auto-links verified Google email and rejects unverified or unsupported provider tokens', async (t) => {
  const tokenMap = {
    'google-verified-token-12345': {
      uid: 'fb-uid-google-1',
      email: 'owner@shopdemo.vn',
      email_verified: true,
      name: 'Minh Anh',
      firebase: { sign_in_provider: 'google.com' },
    },
    'google-unverified-token-12345': {
      uid: 'fb-uid-unverified-2',
      email: 'owner@shopdemo.vn',
      email_verified: false,
      name: 'Fake User',
      firebase: { sign_in_provider: 'google.com' },
    },
    'phone-otp-token-blocked-1234': {
      uid: 'fb-uid-phone-9',
      phone_number: '+84901234567',
      firebase: { sign_in_provider: 'phone' },
    },
  };
  const app = await createFirebaseTestApp(t, { tokenMap });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Shop Owner',
      storeName: 'Cửa hàng Gốc',
      email: 'owner@shopdemo.vn',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);
  const verifyToken = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: verifyToken } });

  const unverified = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'google-unverified-token-12345' },
  });
  assert.equal(unverified.statusCode, 403);
  assert.equal(unverified.json().error.code, 'email_not_verified');

  const phoneBlocked = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'phone-otp-token-blocked-1234' },
  });
  assert.equal(phoneBlocked.statusCode, 403);
  assert.equal(phoneBlocked.json().error.code, 'email_not_verified');

  const linked = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'google-verified-token-12345' },
  });
  assert.equal(linked.statusCode, 200, linked.body);
  const cookies = cookiesFrom(linked);
  assert.ok(cookies.slink_session);
  assert.ok(cookies.slink_csrf);
  assert.equal(linked.json().user.email, 'owner@shopdemo.vn');
  assert.equal(linked.json().stores[0].name, 'Cửa hàng Gốc');
});

test('POST /api/auth/firebase onboards new Google users, logs into existing store on repeat login, and blocks invalid/disabled', async (t) => {
  const tokenMap = {
    'google-new-user-token-999999': {
      uid: 'fb-google-uid-9',
      email: 'lanchi@shopdemo.vn',
      email_verified: true,
      name: 'Chị Lan',
      firebase: { sign_in_provider: 'google.com' },
    },
    'disabled-google-token-88888': {
      uid: 'fb-disabled-uid-8',
      email: 'locked@shopdemo.vn',
      email_verified: true,
      name: 'Locked User',
      firebase: { sign_in_provider: 'google.com' },
    },
  };
  const app = await createFirebaseTestApp(t, { tokenMap });

  const badToken = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'invalid-garbage-token-0000' },
  });
  assert.equal(badToken.statusCode, 401);

  const firstGoogle = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'google-new-user-token-999999' },
  });
  assert.equal(firstGoogle.statusCode, 200);
  assert.equal(firstGoogle.json().status, 'onboarding_required');
  assert.equal(firstGoogle.json().profile.email, 'lanchi@shopdemo.vn');

  const created = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: {
      idToken: 'google-new-user-token-999999',
      completeOnboarding: true,
      displayName: 'Chị Lan',
      storeName: 'Tạp hóa Lan Chi',
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().status, 'created_via_firebase');
  assert.equal(created.json().stores[0].name, 'Tạp hóa Lan Chi');
  const createdCookies = cookiesFrom(created);
  assert.ok(createdCookies.slink_session);

  const repeatLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'google-new-user-token-999999' },
  });
  assert.equal(repeatLogin.statusCode, 200);
  assert.equal(repeatLogin.json().stores[0].name, 'Tạp hóa Lan Chi');

  const disabledOnboard = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: {
      idToken: 'disabled-google-token-88888',
      completeOnboarding: true,
      displayName: 'Locked User',
      storeName: 'Locked Shop',
    },
  });
  assert.equal(disabledOnboard.statusCode, 201);
  const lockedId = disabledOnboard.json().user.id;
  await app.testDb.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [lockedId]);

  const blocked = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin },
    payload: { idToken: 'disabled-google-token-88888' },
  });
  assert.equal(blocked.statusCode, 403);
});
