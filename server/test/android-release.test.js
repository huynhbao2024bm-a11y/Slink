const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
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
