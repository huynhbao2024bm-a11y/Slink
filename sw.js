const CACHE_NAME = 'slink-offline-__SLINK_ASSET_VERSION__';
const APP_SHELL = ['./', './index.html', './styles.css', './workspace.css', './app.js', './client/core.js', './client/charts.js', './client/landing.js', './client/shell.js', './client/dashboard.js', './client/pos.js', './client/products.js', './client/orders.js', './client/inventory.js', './client/customers.js', './client/finance.js', './client/reports.js', './client/staff.js', './client/settings.js', './client/actions.js', './offline-store.js', './offline-ledger.js', './purchase-units.js', './money-inputs.js', './offline-sync.js', './offline-conflict-ui.js', './supplier-returns-ui.js', './barcode-tools.js', './banks-vn.js', './vietqr-tools.js', './escpos-printer.js', './integrations-ui.js', './finance-vouchers-ui.js', './firebase-auth-ui.js', './legal-content.js', './sync-bus.js', './pos-hardware.js', './receipt-image.js', './register-sw.js', './manifest.webmanifest', './assets/slink-icon.svg', './assets/slink-icon-180.png', './assets/slink-icon-192.png', './assets/slink-icon-512.png', './assets/slink-icon-maskable-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.startsWith('slink-') && key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  const requestUrl = new URL(event.request.url);
  const productImage = /^\/api\/stores\/[^/]+\/products\/[^/]+\/image$/.test(requestUrl.pathname) && /^[0-9a-f-]{36}$/i.test(requestUrl.searchParams.get('savedFor') || '');
  if (productImage && event.request.method === 'GET' && requestUrl.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then(async function (response) {
      if (response.ok && (response.headers.get('content-type') || '').startsWith('image/')) {
        const cache = await caches.open(CACHE_NAME); await cache.put(event.request, response.clone());
      }
      return response;
    }).catch(async function () { return await caches.match(event.request) || new Response('', { status: 503 }); }));
    return;
  }
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/download/') || requestUrl.pathname.startsWith('/legal/') || requestUrl.pathname === '/verify' || requestUrl.pathname === '/robots.txt' || requestUrl.pathname === '/sitemap.xml' || /^\/google[A-Za-z0-9_-]{8,64}\.html$/i.test(requestUrl.pathname) || requestUrl.searchParams.has('token')) return;
  if (event.request.mode === 'navigate' && requestUrl.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then(function (response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
      }
      return response;
    }).catch(async function () {
      return (await caches.match(event.request)) || (await caches.match('./index.html')) || Response.error();
    }));
    return;
  }
  const cleanPathname = requestUrl.pathname;
  const shellFile = APP_SHELL.some(function (file) { return new URL(file, self.location.href).pathname === cleanPathname; });
  if (shellFile) {
    event.respondWith(fetch(event.request).then(function (response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(async function () {
      return (await caches.match(event.request)) || (await caches.match(cleanPathname, { ignoreSearch: true })) || Response.error();
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(function (cached) {
    const fresh = fetch(event.request).then(function (response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function () { return cached || Response.error(); });
    return fresh;
  }));
});
