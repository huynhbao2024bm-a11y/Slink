'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'android/app/src/main/assets/web');
const files = [
  'index.html', 'styles.css', 'workspace.css', 'app.js', 'offline-store.js',
  'offline-ledger.js', 'purchase-units.js', 'offline-sync.js', 'register-sw.js', 'sw.js', 'manifest.webmanifest',
  'assets/slink-icon.svg', 'assets/slink-icon-180.png', 'assets/slink-icon-192.png',
  'assets/slink-icon-512.png', 'assets/slink-icon-maskable-512.png',
];
const version = createHash('sha256');
for (const file of files) version.update(fs.readFileSync(path.join(root, file)));
const hash = version.digest('hex').slice(0, 20);
for (const file of files) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (file === 'sw.js') {
    fs.writeFileSync(target, fs.readFileSync(path.join(root, file), 'utf8').replace('__SLINK_ASSET_VERSION__', hash));
  } else if (file === 'index.html') {
    const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/\b(src|href)="\.\/([^"?]+)"/g, (match, attribute, asset) =>
      files.includes(asset) ? `${attribute}="./${asset}?appAssets=${hash}"` : match);
    fs.writeFileSync(target, html);
  } else fs.copyFileSync(path.join(root, file), target);
}
const iconDir = path.join(root, 'android/app/src/main/res/mipmap-xxxhdpi');
fs.mkdirSync(iconDir, { recursive: true });
fs.copyFileSync(path.join(root, 'assets/slink-icon-192.png'), path.join(iconDir, 'ic_launcher.png'));
console.log('Prepared Android app assets ' + hash);
