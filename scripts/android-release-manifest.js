'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');

function makeManifest({ apk, versionCode, versionName, tag }) {
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || !/^\d+\.\d+\.\d+$/.test(versionName) || tag !== 'android-v' + versionName) {
    throw new Error('Release tag, versionName and versionCode must agree.');
  }
  const bytes = readFileSync(apk);
  if (!bytes.length || bytes.length > 64 * 1024 * 1024 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid APK archive.');
  return {
    schemaVersion: 1, packageName: 'com.slink.retail', versionCode, versionName,
    url: `https://github.com/huynhbao2024bm-a11y/Slink/releases/download/${tag}/Slink.apk`,
    sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length,
  };
}

if (require.main === module) {
  const [apk, code, versionName, tag, output] = process.argv.slice(2);
  if (!output) throw new Error('Expected APK, versionCode, versionName, tag and output path.');
  writeFileSync(output, JSON.stringify(makeManifest({ apk, versionCode: Number(code), versionName, tag }), null, 2) + '\n');
}
module.exports = { makeManifest };
