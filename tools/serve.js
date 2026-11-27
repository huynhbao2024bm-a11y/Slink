const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ALLOWED_TOP_FILES = new Set([
  'index.html', 'app.js', 'purchase-units.js', 'money-inputs.js', 'offline-store.js',
  'offline-ledger.js', 'offline-sync.js', 'offline-conflict-ui.js', 'supplier-returns-ui.js',
  'barcode-tools.js', 'banks-vn.js', 'vietqr-tools.js', 'escpos-printer.js',
  'integrations-ui.js', 'finance-vouchers-ui.js', 'firebase-auth-ui.js', 'legal-content.js',
  'sync-bus.js', 'pos-hardware.js', 'receipt-image.js', 'styles.css', 'workspace.css',
  'manifest.webmanifest', 'register-sw.js', 'sw.js', 'favicon.ico', 'google02950e16d4d7ed98.html',
]);
const ALLOWED_DIR_PREFIXES = [`client${path.sep}`, `assets${path.sep}`];
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end('Bad request'); return; }

  const file = path.resolve(root, `.${pathname}`);
  const relPath = path.relative(root, file);
  const isRootIndex = file === root;
  const isAllowed = isRootIndex
    || ALLOWED_TOP_FILES.has(relPath)
    || ALLOWED_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix));
  if (!isAllowed || (file !== root && !file.startsWith(`${root}${path.sep}`))) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (statError, stat) => {
    if (statError) { response.writeHead(404).end('Not found'); return; }
    const actual = stat.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(actual, (error, contents) => {
      if (error) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, {
        'Content-Type': mime[path.extname(actual).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(contents);
    });
  });
}).listen(4173, '127.0.0.1', () => {
  process.stdout.write('Slink preview: http://127.0.0.1:4173\n');
});
