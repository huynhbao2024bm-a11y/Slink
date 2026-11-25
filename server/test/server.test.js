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
  assert.match(sitemap.body, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(sitemap.body, /<lastmod>2026-11-/);
  assert.match(sitemap.body, /<priority>1\.0<\/priority>/);
  assert.match(sitemap.body, /\/assets\/slink-og-cover\.png/);
  assert.match(sitemap.body, /\/legal\/privacy/);

  assert.match(html.body, /application\/ld\+json/);
  assert.match(html.body, /SoftwareApplication/);
  assert.match(html.body, /hreflang="vi-VN"/);
  assert.match(html.body, /<noscript>/);

  const privacy = await app.inject({ method: 'GET', url: '/legal/privacy', headers: { host: 'slink-xny3.onrender.com' } });
  assert.equal(privacy.statusCode, 200);
  assert.match(privacy.body, /<meta name="robots" content="index,follow" \/>/);
  assert.match(privacy.body, /<link rel="canonical" href="http:\/\/slink-xny3\.onrender\.com\/legal\/privacy" \/>/);
  assert.match(privacy.body, /"@type":"WebPage"/);

  const builtInVerify = await app.inject({ method: 'GET', url: '/google02950e16d4d7ed98.html' });
  assert.equal(builtInVerify.statusCode, 200);
  assert.match(builtInVerify.headers['content-type'], /text\/html/);
  assert.equal(builtInVerify.body.trim(), 'google-site-verification: google02950e16d4d7ed98.html');

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

test('supports Google Search Console verification via env meta token and HTML file while rejecting unsafe values', async (t) => {
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }), end: async () => {} };
  const app = await buildServer({
    pool,
    logger: false,
    env: {
      PUBLIC_ORIGIN: 'https://pos.slink.vn',
      GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification" content="gsc_MetaToken_12345" />, google1a2b3c4d5e6f7a8b.html, "injected<script>',
    },
  });
  t.after(() => app.close());

  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /<meta name="google-site-verification" content="gsc_MetaToken_12345" \/>/);
  assert.match(home.body, /<link rel="canonical" href="https:\/\/pos\.slink\.vn\/" \/>/);
  assert.doesNotMatch(home.body, /injected<script>/);

  const fileVerify = await app.inject({ method: 'GET', url: '/google1a2b3c4d5e6f7a8b.html' });
  assert.equal(fileVerify.statusCode, 200);
  assert.match(fileVerify.headers['content-type'], /text\/html/);
  assert.equal(fileVerify.headers['cache-control'], 'no-store');
  assert.equal(fileVerify.body.trim(), 'google-site-verification: google1a2b3c4d5e6f7a8b.html');

  const unconfiguredVerify = await app.inject({ method: 'GET', url: '/googleffffffffffffffff.html' });
  assert.equal(unconfiguredVerify.statusCode, 404);
});
