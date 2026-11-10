const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { makeManifest } = require('../../scripts/android-release-manifest');

test('Android publication binds the APK bytes to one version and release tag', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'slink-update-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const apk = path.join(dir, 'Slink.apk');
  writeFileSync(apk, Buffer.from('PK first fixture'));
  const options = { apk, versionCode: 2, versionName: '0.3.1', tag: 'android-v0.3.1' };
  const first = makeManifest(options);
  writeFileSync(apk, Buffer.from('PK different fixture'));
  assert.notEqual(first.sha256, makeManifest(options).sha256);
  assert.equal(first.packageName, 'com.slink.retail');
  assert.match(first.url, /\/android-v0.3.1\/Slink.apk$/);
  assert.throws(() => makeManifest({ ...options, tag: 'android-v0.4.0' }));
  assert.throws(() => makeManifest({ ...options, versionCode: 1.5 }));
  writeFileSync(apk, Buffer.from('error page'));
  assert.throws(() => makeManifest(options));
});

test('Android update opens its own HTML and versioned assets instead of the old worker cache', () => {
  const root = path.resolve(__dirname, '../..');
  execFileSync(process.execPath, ['scripts/android-assets.js'], { cwd: root });
  const html = readFileSync(path.join(root, 'android/app/src/main/assets/web/index.html'), 'utf8');
  const scripts = [...html.matchAll(/src="\.\/([^"?]+)\?appAssets=([a-f0-9]{20})"/g)];
  assert.ok(scripts.some(match => match[1] === 'app.js'));
  assert.ok(scripts.some(match => match[1] === 'offline-ledger.js'));
  assert.equal(new Set(scripts.map(match => match[2])).size, 1);
  assert.match(html, /href="\.\/workspace\.css\?appAssets=[a-f0-9]{20}"/);
  assert.equal(/(?:src|href)="\.\/(?:app\.js|styles\.css|workspace\.css)"/.test(html), false);
  const native = readFileSync(path.join(root, 'android/app/src/main/java/com/slink/retail/MainActivity.java'), 'utf8');
  assert.match(native, /appendQueryParameter\("appVersion", String\.valueOf\(BuildConfig\.VERSION_CODE\)\)/);
});
