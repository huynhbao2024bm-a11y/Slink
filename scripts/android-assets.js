'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'android/app/src/main/assets/web');
const files = [
  'index.html', 'styles.css', 'workspace.css', 'app.js', 'offline-store.js',
  'assets/fonts/JetBrains-Mono-OFL.txt', 'assets/fonts/Plus-Jakarta-Sans-OFL.txt',
  'assets/fonts/jetbrains-mono-cyrillic-e17cfd15fb96.woff2',
  'assets/fonts/jetbrains-mono-cyrillic-ext-62213be8a78b.woff2',
  'assets/fonts/jetbrains-mono-greek-0a557721b1f8.woff2',
  'assets/fonts/jetbrains-mono-latin-83c005d49d8a.woff2',
  'assets/fonts/jetbrains-mono-latin-ext-db5ff4db83e5.woff2',
  'assets/fonts/jetbrains-mono-vietnamese-c89b9cc0bc62.woff2',
  'assets/fonts/plus-jakarta-sans-cyrillic-ext-c46a510ab439.woff2',
  'assets/fonts/plus-jakarta-sans-latin-153fc85b7029.woff2',
  'assets/fonts/plus-jakarta-sans-latin-ext-38e3b8fd8045.woff2',
  'assets/fonts/plus-jakarta-sans-vietnamese-b275d1258601.woff2',

  'offline-ledger.js', 'purchase-units.js', 'money-inputs.js', 'offline-sync.js',
  'offline-conflict-ui.js', 'supplier-returns-ui.js', 'barcode-tools.js',
  'banks-vn.js', 'vietqr-tools.js', 'escpos-printer.js', 'integrations-ui.js',
  'finance-vouchers-ui.js', 'firebase-auth-ui.js', 'legal-content.js', 'sync-bus.js', 'pos-hardware.js',
  'receipt-image.js', 'client/core.js', 'client/charts.js', 'client/landing.js', 'client/shell.js',
  'client/dashboard.js', 'client/pos.js', 'client/products.js', 'client/orders.js',
  'client/inventory.js', 'client/customers.js', 'client/finance.js', 'client/reports.js',
  'client/staff.js', 'client/settings.js', 'client/actions.js',
  'register-sw.js', 'sw.js', 'manifest.webmanifest',
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
