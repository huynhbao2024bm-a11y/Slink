'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const { assertSafeOutboundUrl } = require('../providers/safe-url');
const { encryptStoreCredentials } = require('../providers/credentials');

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

async function createHardeningApp(t, env = {}) {
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
    env: {
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: origin,
      DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
      ...env,
    },
  });
  app.testDb = db;
  t.after(() => app.close());
  return app;
}

test('assertSafeOutboundUrl blocks loopback, private, metadata, credentialed, and non-HTTPS targets', () => {
  const blocked = [
    'http://127.0.0.1:8080/hook',
    'https://127.0.0.1/hook',
    'https://169.254.169.254/latest/meta-data/',
    'http://169.254.169.254/latest/meta-data/',
    'https://10.0.0.1/api',
    'https://192.168.1.5/api',
    'https://172.16.0.5/api',
    'https://100.64.0.1/api',
    'https://localhost/api',
    'https://[::1]/api',
    'https://[::ffff:127.0.0.1]/api',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://user:pass@api.example.com/v1',
    'http://api.example.com/v1',
  ];
  for (const url of blocked) {
    assert.throws(() => assertSafeOutboundUrl(url, { allowLocalInTest: false }), `Should block ${url}`);
  }
  const allowed = assertSafeOutboundUrl('https://api.example.com/v1/einvoice', { allowLocalInTest: false });
  assert.equal(allowed.origin, 'https://api.example.com');
});

test('encryptStoreCredentials fails closed in production without an encryption key seed', () => {
  assert.throws(
    () => encryptStoreCredentials({ GHN_TOKEN: 'secret' }, { NODE_ENV: 'production' }),
    /Production requires INTEGRATION_ENCRYPTION_KEY/
  );
});

test('SSRF URLs are rejected on integration settings and API routes emit Cache-Control: no-store by default', async (t) => {
  const app = await createHardeningApp(t);
  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      displayName: 'Security Tester',
      storeName: 'Security Shop',
      email: 'sec@slink.test',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);
  const cookies = cookiesFrom(reg);
  const headers = {
    origin,
    cookie: `slink_session=${cookies.slink_session}; slink_csrf=${cookies.slink_csrf}`,
    'x-csrf-token': cookies.slink_csrf,
  };
  const storeId = reg.json().stores[0].id;

  const meRes = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
  assert.equal(meRes.statusCode, 200);
  assert.equal(meRes.headers['cache-control'], 'no-store');

  const storesRes = await app.inject({ method: 'GET', url: '/api/stores', headers });
  assert.equal(storesRes.statusCode, 200);
  assert.equal(storesRes.headers['cache-control'], 'no-store');

  const ssrfRes1 = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/integrations/settings`,
    headers,
    payload: { credentials: { MISA_EINVOICE_URL: 'http://169.254.169.254/latest/meta-data/' } },
  });
  assert.equal(ssrfRes1.statusCode, 400);

  const ssrfRes2 = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/integrations/settings`,
    headers,
    payload: { credentials: { MOMO_ENDPOINT: 'https://127.0.0.1/internal' } },
  });
  assert.equal(ssrfRes2.statusCode, 400);

  const htmlRes = await app.inject({ method: 'GET', url: '/' });
  assert.equal(htmlRes.statusCode, 200);
  const csp = htmlRes.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /recaptcha/);
});

test('GHN webhook fails closed in production without GHN_WEBHOOK_SECRET and enforces strict ShopID matching', async (t) => {
  const appProdMissingSecret = await createHardeningApp(t, {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://slink-xny3.onrender.com',
    APP_DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/slink',
    PG_SSL: 'true',
    GHN_TOKEN: 'ghn-tok-1234',
    GHN_SHOP_ID: '6790898',
  });
  const reg = await appProdMissingSecret.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'https://slink-xny3.onrender.com' },
    payload: {
      displayName: 'Owner',
      storeName: 'Store One',
      email: 'ghnsec@slink.test',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);
  const storeId = reg.json().stores[0].id;

  const missingSecretRes = await appProdMissingSecret.inject({
    method: 'POST',
    url: `/api/webhooks/shipping/ghn/${storeId}`,
    payload: { OrderCode: 'GHN1', Status: 'delivering', ShopID: 6790898 },
  });
  assert.equal(missingSecretRes.statusCode, 503);

  const appProdWithSecret = await createHardeningApp(t, {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://slink-xny3.onrender.com',
    APP_DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/slink',
    PG_SSL: 'true',
    GHN_TOKEN: 'ghn-tok-1234',
    GHN_SHOP_ID: '6790898',
    GHN_WEBHOOK_SECRET: 'ghn_super_secret_key_2026',
  });
  const reg2 = await appProdWithSecret.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'https://slink-xny3.onrender.com' },
    payload: {
      displayName: 'Owner 2',
      storeName: 'Store Two',
      email: 'ghnsec2@slink.test',
      password: 'VeryStrongPassword#2026',
    },
  });
  const storeId2 = reg2.json().stores[0].id;

  const omittedShopRes = await appProdWithSecret.inject({
    method: 'POST',
    url: `/api/webhooks/shipping/ghn/${storeId2}`,
    headers: { 'x-ghn-webhook-secret': 'ghn_super_secret_key_2026' },
    payload: { OrderCode: 'GHN1', Status: 'delivering' },
  });
  assert.equal(omittedShopRes.statusCode, 401);

  const okRes = await appProdWithSecret.inject({
    method: 'POST',
    url: `/api/webhooks/shipping/ghn/${storeId2}`,
    headers: { 'x-ghn-webhook-secret': 'ghn_super_secret_key_2026' },
    payload: { OrderCode: 'GHN1', Status: 'delivering', ShopID: 6790898 },
  });
  assert.equal(okRes.statusCode, 200);
});
