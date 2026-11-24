const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildServer } = require('../index');

test('server exposes the app shell and health routes without exposing source files', async (t) => {
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }), end: async () => {} };
  const app = await buildServer({ pool, logger: false, env: {} });
  t.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });

  const ready = await app.inject({ method: 'GET', url: '/api/ready' });
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json(), { status: 'ready' });

  const html = await app.inject({ method: 'GET', url: '/' });
  assert.equal(html.statusCode, 200);
  assert.match(html.headers['content-type'], /text\/html/);
  assert.equal(html.headers['cache-control'], 'no-cache');
  assert.match(html.body, /Slink/);
  assert.match(html.headers['content-security-policy'], /default-src 'self'/);

  for (const asset of ['/workspace.css', '/assets/vendor/gsap.min.js', '/assets/slink-og-cover.png', '/favicon.ico', '/offline-store.js', '/offline-ledger.js', '/offline-sync.js']) {
    const response = await app.inject({ method: 'GET', url: asset });
    assert.equal(response.statusCode, 200, `Required interface asset: ${asset}`);
  }

  const brCss = await app.inject({ method: 'GET', url: '/workspace.css', headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(brCss.statusCode, 200);
  assert.equal(brCss.headers['content-encoding'], 'br');
  assert.ok(brCss.headers.etag);
  const notModified = await app.inject({ method: 'GET', url: '/workspace.css', headers: { 'if-none-match': brCss.headers.etag } });
  assert.equal(notModified.statusCode, 304);

  const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
  assert.equal(robots.statusCode, 200);
  assert.match(robots.body, /Sitemap:/);
  assert.match(robots.body, /Disallow: \/api\//);

  const sitemap = await app.inject({ method: 'GET', url: '/sitemap.xml' });
  assert.equal(sitemap.statusCode, 200);
  assert.match(sitemap.headers['content-type'], /application\/xml/);
  assert.match(sitemap.body, /\/legal\/privacy/);

  for (const apkRoute of ['/download/android', '/download/slink-latest.apk']) {
    const download = await app.inject({ method: 'GET', url: apkRoute });
    assert.equal(download.statusCode, 302);
    assert.equal(download.headers.location, 'https://github.com/huynhbao2024bm-a11y/Slink/releases/latest/download/Slink.apk');
    assert.match(download.headers['cache-control'], /no-store/);
    assert.equal(download.headers['x-robots-tag'], 'noindex, nofollow');
  }

  assert.equal(health.headers['permissions-policy'], 'camera=(self), microphone=(), geolocation=(), payment=()');
  assert.equal(health.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(health.headers['x-robots-tag'], 'noindex, nofollow');

  const worker = await app.inject({ method: 'GET', url: '/sw.js' });
  assert.equal(worker.statusCode, 200);
  assert.equal(worker.headers['cache-control'], 'no-store');
  assert.match(worker.body, /slink-offline-[a-f0-9]{20}/);
  assert.ok(!worker.body.includes('__SLINK_ASSET_VERSION__'));
  assert.match(worker.body, /if \(shellFile && cached\) return cached/);

  const privateFile = await app.inject({ method: 'GET', url: '/server/db.js' });
  assert.equal(privateFile.statusCode, 404);
  const missingApi = await app.inject({ method: 'GET', url: '/api/not-implemented' });
  assert.equal(missingApi.statusCode, 404);
  assert.equal(missingApi.json().error.code, 'not_found');
});

test('readiness fails closed if the database is not reachable', async (t) => {
  const pool = { query: async () => { throw new Error('connection unavailable'); }, end: async () => {} };
  const app = await buildServer({ pool, logger: false, env: {} });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/api/ready' });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { status: 'unavailable' });
});
