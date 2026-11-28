const Fastify = require('fastify');
const { LogController } = Fastify;
const cookie = require('@fastify/cookie');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const staticFiles = require('@fastify/static');
const { existsSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { brotliCompressSync, constants: zlibConstants, gzipSync } = require('node:zlib');
const path = require('node:path');
const { ApiError, emailVerificationDisabled, registerAuthRoutes } = require('./auth');
const { isFirebaseFullyConfigured, loadServiceAccount } = require('./firebase-auth');
const { createPool } = require('./db');
const { databaseTransportOptions } = require('./database-transport');
const { registerProductRoutes } = require('./products');
const { registerSerialRoutes } = require('./serials');
const { registerProductImageRoutes } = require('./product-images');
const { registerAffiliateRoutes } = require('./affiliate');
const { assertRuntimeSchema } = require('./runtime-schema');
const { registerSalesRoutes } = require('./sales');
const { registerPromotionRoutes } = require('./promotions');
const { registerReturnRoutes } = require('./returns');
const { registerExchangeRoutes } = require('./exchanges');
const { registerOfflineConflictRoutes } = require('./offline-conflicts');
const { registerRecordRoutes } = require('./records');
const { registerStockRoutes } = require('./stock');
const { registerPaymentRoutes } = require('./payments');
const { registerPurchaseRoutes } = require('./purchases');
const { registerSupplierReturnRoutes } = require('./supplier-returns');
const { registerPurchaseOrderRoutes } = require('./purchase-orders');
const { registerFinanceRoutes } = require('./finance');
const { registerAnalyticsRoutes } = require('./analytics');
const { registerDashboardRoutes } = require('./dashboard');
const { registerStoreSettingsRoutes } = require('./settings');
const { registerExportRoutes } = require('./exports');
const { registerAccountingTt152Routes } = require('./accounting-tt152');
const { registerAiAssistantRoutes } = require('./ai-assistant');
const { registerStaffRoutes } = require('./staff');
const { registerCashRegisterRoutes } = require('./cash-register');
const { registerAuditRoutes } = require('./audit');
const { registerSecurityRoutes } = require('./security');
const { registerWarehouseRoutes } = require('./warehouses');
const { registerChannelMappingRoutes } = require('./channel-mappings');
const { registerChannelOrderRoutes } = require('./channel-orders');
const { registerIntegrationRoutes } = require('./integrations');
const { registerHrCrmRoutes } = require('./hr-crm');
const { registerBatchRoutes } = require('./batches');
const { registerShiftRoutes } = require('./shifts');
const legalContent = require('../legal-content');

const APP_ROOT = path.resolve(__dirname, '..');
const ASSETS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/verify', 'index.html'],
  ['/invite', 'index.html'],
  ['/google02950e16d4d7ed98.html', 'google02950e16d4d7ed98.html'],
  ['/assets/slink-showcase-web-pos.webp', 'assets/slink-showcase-web-pos.webp'],
  ['/assets/slink-showcase-web-dashboard.webp', 'assets/slink-showcase-web-dashboard.webp'],
  ['/assets/slink-showcase-mobile-pos.webp', 'assets/slink-showcase-mobile-pos.webp'],
  ['/assets/slink-og-cover.png', 'assets/slink-og-cover.png'],
  ['/favicon.ico', 'assets/slink-icon-192.png'],
  ['/assets/fonts/jetbrains-mono-cyrillic-e17cfd15fb96.woff2', 'assets/fonts/jetbrains-mono-cyrillic-e17cfd15fb96.woff2'],
  ['/assets/fonts/jetbrains-mono-cyrillic-ext-62213be8a78b.woff2', 'assets/fonts/jetbrains-mono-cyrillic-ext-62213be8a78b.woff2'],
  ['/assets/fonts/jetbrains-mono-greek-0a557721b1f8.woff2', 'assets/fonts/jetbrains-mono-greek-0a557721b1f8.woff2'],
  ['/assets/fonts/jetbrains-mono-latin-83c005d49d8a.woff2', 'assets/fonts/jetbrains-mono-latin-83c005d49d8a.woff2'],
  ['/assets/fonts/jetbrains-mono-latin-ext-db5ff4db83e5.woff2', 'assets/fonts/jetbrains-mono-latin-ext-db5ff4db83e5.woff2'],
  ['/assets/fonts/jetbrains-mono-vietnamese-c89b9cc0bc62.woff2', 'assets/fonts/jetbrains-mono-vietnamese-c89b9cc0bc62.woff2'],
  ['/assets/fonts/plus-jakarta-sans-cyrillic-ext-c46a510ab439.woff2', 'assets/fonts/plus-jakarta-sans-cyrillic-ext-c46a510ab439.woff2'],
  ['/assets/fonts/plus-jakarta-sans-latin-153fc85b7029.woff2', 'assets/fonts/plus-jakarta-sans-latin-153fc85b7029.woff2'],
  ['/assets/fonts/plus-jakarta-sans-latin-ext-38e3b8fd8045.woff2', 'assets/fonts/plus-jakarta-sans-latin-ext-38e3b8fd8045.woff2'],
  ['/assets/fonts/plus-jakarta-sans-vietnamese-b275d1258601.woff2', 'assets/fonts/plus-jakarta-sans-vietnamese-b275d1258601.woff2'],

  ['/styles.css', 'styles.css'],
  ['/workspace.css', 'workspace.css'],
  ['/assets/vendor/gsap.min.js', 'assets/vendor/gsap.min.js'],
  ['/app.js', 'app.js'],
  ['/offline-store.js', 'offline-store.js'],
  ['/offline-ledger.js', 'offline-ledger.js'],
  ['/purchase-units.js', 'purchase-units.js'],
  ['/money-inputs.js', 'money-inputs.js'],
  ['/offline-sync.js', 'offline-sync.js'],
  ['/offline-conflict-ui.js', 'offline-conflict-ui.js'],
  ['/supplier-returns-ui.js', 'supplier-returns-ui.js'],
  ['/barcode-tools.js', 'barcode-tools.js'],
  ['/banks-vn.js', 'banks-vn.js'],
  ['/vietqr-tools.js', 'vietqr-tools.js'],
  ['/escpos-printer.js', 'escpos-printer.js'],
  ['/integrations-ui.js', 'integrations-ui.js'],
  ['/finance-vouchers-ui.js', 'finance-vouchers-ui.js'],
  ['/firebase-auth-ui.js', 'firebase-auth-ui.js'],
  ['/legal-content.js', 'legal-content.js'],
  ['/sync-bus.js', 'sync-bus.js'],
  ['/pos-hardware.js', 'pos-hardware.js'],
  ['/receipt-image.js', 'receipt-image.js'],
  ['/client/core.js', 'client/core.js'],
  ['/client/charts.js', 'client/charts.js'],
  ['/client/landing.js', 'client/landing.js'],
  ['/client/shell.js', 'client/shell.js'],
  ['/client/dashboard.js', 'client/dashboard.js'],
  ['/client/pos.js', 'client/pos.js'],
  ['/client/products.js', 'client/products.js'],
  ['/client/orders.js', 'client/orders.js'],
  ['/client/inventory.js', 'client/inventory.js'],
  ['/client/customers.js', 'client/customers.js'],
  ['/client/finance.js', 'client/finance.js'],
  ['/client/reports.js', 'client/reports.js'],
  ['/client/staff.js', 'client/staff.js'],
  ['/client/settings.js', 'client/settings.js'],
  ['/client/actions.js', 'client/actions.js'],
  ['/register-sw.js', 'register-sw.js'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/sw.js', 'sw.js'],
  ['/assets/slink-icon.svg', 'assets/slink-icon.svg'],
  ['/assets/slink-icon-180.png', 'assets/slink-icon-180.png'],
  ['/assets/slink-icon-192.png', 'assets/slink-icon-192.png'],
  ['/assets/slink-icon-512.png', 'assets/slink-icon-512.png'],
  ['/assets/slink-icon-maskable-512.png', 'assets/slink-icon-maskable-512.png'],
]);

const APP_ASSET_VERSION = createHash('sha256').update(Array.from(new Set(ASSETS.values())).map(file => readFileSync(path.join(APP_ROOT, file))).map(content => createHash('sha256').update(content).digest('hex')).join('|')).digest('hex').slice(0, 20);

const LONG_LIVED_ASSETS = new Set([
  '/favicon.ico',
  '/assets/fonts/jetbrains-mono-cyrillic-e17cfd15fb96.woff2',
  '/assets/fonts/jetbrains-mono-cyrillic-ext-62213be8a78b.woff2',
  '/assets/fonts/jetbrains-mono-greek-0a557721b1f8.woff2',
  '/assets/fonts/jetbrains-mono-latin-83c005d49d8a.woff2',
  '/assets/fonts/jetbrains-mono-latin-ext-db5ff4db83e5.woff2',
  '/assets/fonts/jetbrains-mono-vietnamese-c89b9cc0bc62.woff2',
  '/assets/fonts/plus-jakarta-sans-cyrillic-ext-c46a510ab439.woff2',
  '/assets/fonts/plus-jakarta-sans-latin-153fc85b7029.woff2',
  '/assets/fonts/plus-jakarta-sans-latin-ext-38e3b8fd8045.woff2',
  '/assets/fonts/plus-jakarta-sans-vietnamese-b275d1258601.woff2',

  '/assets/slink-icon.svg',
  '/assets/slink-icon-180.png',
  '/assets/slink-icon-192.png',
  '/assets/slink-icon-512.png',
  '/assets/slink-icon-maskable-512.png',
  '/assets/slink-showcase-web-pos.webp',
  '/assets/slink-showcase-web-dashboard.webp',
  '/assets/slink-showcase-mobile-pos.webp',
  '/assets/slink-og-cover.png',
  '/assets/vendor/gsap.min.js',
]);

const TEXT_CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

const STATIC_TEXT_CACHE = new Map();
function buildStaticTextEntry(rawInput, contentType) {
  const raw = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput, 'utf8');
  const etag = `W/"${createHash('sha256').update(raw).digest('hex').slice(0, 16)}"`;
  return {
    contentType,
    etag,
    raw,
    gzip: gzipSync(raw, { level: 6 }),
    br: brotliCompressSync(raw, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 } }),
  };
}

for (const fileName of new Set(ASSETS.values())) {
  if (fileName === 'sw.js') continue;
  const contentType = TEXT_CONTENT_TYPES.get(path.extname(fileName));
  if (!contentType) continue;
  STATIC_TEXT_CACHE.set(fileName, buildStaticTextEntry(readFileSync(path.join(APP_ROOT, fileName)), contentType));
}

const DEFAULT_PUBLIC_ORIGIN = 'https://slink-xny3.onrender.com';
const SITEMAP_HOME_LASTMOD = '2026-11-25';

function parseGoogleSiteVerification(env = {}) {
  const metaTokens = new Set();
  const fileNames = new Set();
  const inputs = [env.GOOGLE_SITE_VERIFICATION, env.GOOGLE_SITE_VERIFICATION_FILE]
    .filter((value) => typeof value === 'string' && value.trim())
    .join('\n');
  if (!inputs) return { metaTokens: [], fileNames: [] };

  let remainder = inputs.replace(/<meta\b[^>]*>/gi, (tag) => {
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (contentMatch && /^[A-Za-z0-9_-]{8,128}$/.test(contentMatch[1].trim())) {
      metaTokens.add(contentMatch[1].trim());
    }
    return ' ';
  });
  remainder = remainder.replace(/\bgoogle-site-verification\s*:\s*(google[A-Za-z0-9_-]{8,64}\.html)\b/gi, (_, file) => {
    fileNames.add(file);
    return ' ';
  });
  for (const part of remainder.split(/[\s,;]+/)) {
    const item = part.trim();
    if (!item) continue;
    if (/^google[A-Za-z0-9_-]{8,64}\.html$/i.test(item)) {
      fileNames.add(item);
    } else if (/^[A-Za-z0-9_-]{8,128}$/.test(item)) {
      metaTokens.add(item);
    }
  }
  return {
    metaTokens: Array.from(metaTokens),
    fileNames: Array.from(fileNames),
  };
}

function prepareIndexEntry(env = {}, metaTokens = []) {
  const baseEntry = STATIC_TEXT_CACHE.get('index.html');
  let html = baseEntry.raw.toString('utf8');
  let originOverride = '';
  if (env.PUBLIC_ORIGIN) {
    try {
      const parsed = new URL(env.PUBLIC_ORIGIN);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        originOverride = parsed.origin;
      }
    } catch {
      // Fallback to default canonical origin when PUBLIC_ORIGIN is unset or invalid.
    }
  }
  if (originOverride && originOverride !== DEFAULT_PUBLIC_ORIGIN) {
    html = html.split(DEFAULT_PUBLIC_ORIGIN).join(originOverride);
  }
  if (metaTokens.length > 0) {
    const tags = metaTokens
      .map((token) => `    <meta name="google-site-verification" content="${token}" />`)
      .join('\n');
    html = html.replace('  </head>', `${tags}\n  </head>`);
  }
  return html === baseEntry.raw.toString('utf8')
    ? baseEntry
    : buildStaticTextEntry(html, baseEntry.contentType);
}

function isFrontendPath(pathName, verificationFiles = null) {
  return ASSETS.has(pathName)
    || pathName === '/robots.txt'
    || pathName === '/sitemap.xml'
    || pathName.startsWith('/legal/')
    || Boolean(verificationFiles && pathName.length > 1 && verificationFiles.has(pathName.slice(1)));
}

function resolvePublicOrigin(request, env) {
  if (env.PUBLIC_ORIGIN) {
    try {
      return new URL(env.PUBLIC_ORIGIN).origin;
    } catch {
      // Fallback to request host when running locally with invalid or unset PUBLIC_ORIGIN.
    }
  }
  const host = typeof request.headers.host === 'string' && /^[a-z0-9.:-]+$/i.test(request.headers.host)
    ? request.headers.host
    : 'slink-xny3.onrender.com';
  return `${request.protocol === 'https' ? 'https' : 'http'}://${host}`;
}

function sendLatestAndroidApkRedirect(reply) {
  reply.header('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  reply.header('pragma', 'no-cache');
  reply.header('x-robots-tag', 'noindex, nofollow');
  return reply.redirect('https://github.com/huynhbao2024bm-a11y/Slink/releases/latest/download/Slink.apk');
}

function serveCachedTextAsset(request, reply, entry) {
  if (request.headers['if-none-match'] === entry.etag) {
    return reply.code(304).header('etag', entry.etag).send();
  }
  const accept = typeof request.headers['accept-encoding'] === 'string' ? request.headers['accept-encoding'] : '';
  reply.header('etag', entry.etag).header('vary', 'accept-encoding').type(entry.contentType);
  if (/\bbr\b/i.test(accept)) {
    return reply.header('content-encoding', 'br').send(entry.br);
  }
  if (/\bgzip\b/i.test(accept)) {
    return reply.header('content-encoding', 'gzip').send(entry.gzip);
  }
  return reply.send(entry.raw);
}

function trustedProxies(addressesValue, hopsValue) {
  const addresses = (addressesValue || '').split(',').map((item) => item.trim()).filter(Boolean);
  const hops = (hopsValue || '').trim();
  if (addresses.length && hops) {
    throw new Error('Configure either TRUSTED_PROXY_IPS or TRUSTED_PROXY_HOPS, not both.');
  }
  if (addresses.length) return addresses;
  if (!hops) return false;
  if (!/^[1-5]$/.test(hops)) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer from 1 to 5.');
  }
  return Number(hops);
}

function validateProductionConfig(env) {
  if (env.DEMO_DISABLE_EMAIL_VERIFICATION && !['true', 'false'].includes(env.DEMO_DISABLE_EMAIL_VERIFICATION)) {
    throw new Error('DEMO_DISABLE_EMAIL_VERIFICATION must be either true or false.');
  }
  if (env.NODE_ENV !== 'production') return;
  databaseTransportOptions(env, env.APP_DATABASE_URL, 'APP_DATABASE_URL');
  let publicOrigin;
  try {
    publicOrigin = new URL(env.PUBLIC_ORIGIN);
  } catch {
    throw new Error('Production requires a valid HTTPS PUBLIC_ORIGIN.');
  }
  if (publicOrigin.protocol !== 'https:' || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash || publicOrigin.username || publicOrigin.password) {
    throw new Error('Production PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.');
  }
  const firebaseConfigured = isFirebaseFullyConfigured(env, Boolean(loadServiceAccount(env)));
  const effectiveDeliveryUrl = env.EMAIL_DELIVERY_URL || (env.RESEND_API_KEY?.trim() ? 'https://api.resend.com/emails' : '');
  const effectiveDeliveryToken = env.EMAIL_DELIVERY_TOKEN || env.RESEND_API_KEY || '';
  if (!firebaseConfigured) {
    let deliveryUrl;
    try {
      deliveryUrl = new URL(effectiveDeliveryUrl);
    } catch {
      throw new Error('Production requires Firebase Auth configuration or valid EMAIL_DELIVERY_URL (or RESEND_API_KEY) values.');
    }
    if (deliveryUrl.protocol !== 'https:' || typeof effectiveDeliveryToken !== 'string' || effectiveDeliveryToken.length < 32) {
      throw new Error('Production requires an HTTPS email delivery endpoint and a token of at least 32 characters.');
    }
    if (typeof env.EMAIL_FROM !== 'string' || !env.EMAIL_FROM.trim() || env.EMAIL_FROM.length > 320 || /[\r\n]/.test(env.EMAIL_FROM)) {
      throw new Error('Production requires EMAIL_FROM to be set; its domain must be verified with the email provider.');
    }
  }
}

async function buildServer({ pool = null, env = process.env, logger = true, firebaseVerifier = null, aiClient = null } = {}) {
  const app = Fastify({
    logController: new LogController({
      disableRequestLogging: (request) => request.url.startsWith('/api/') || request.url.includes('?'),
    }),
    logger: logger ? {
      level: env.LOG_LEVEL || 'info',
      redact: {
        paths: [
          'req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]',
          'req.headers["secure-token"]', 'req.headers["x-webhook-token"]', 'req.headers["x-ghn-webhook-secret"]',
          'req.headers["x-api-key"]', 'req.headers["token"]',
          'req.body.password', 'req.body.currentPassword', 'req.body.newPassword', 'req.body.pin',
          'req.body.secret', 'req.body.code', 'req.body.token', 'req.body.idToken', 'req.body.firebaseIdToken',
          'req.body.captchaToken', 'req.body.captchaAnswer', 'req.body.registrationTicket',
          'req.body.imageBase64',
          'req.body.refreshToken', 'req.body.signature', 'req.body.credentials', 'req.body.credentials.*',
        ],
        censor: '[REDACTED]',
      },
    } : false,
    bodyLimit: 1024 * 1024,
    trustProxy: trustedProxies(env.TRUSTED_PROXY_IPS, env.TRUSTED_PROXY_HOPS),
    routerOptions: { ignoreTrailingSlash: true },
  });
  app.decorate('slinkEmailVerificationDisabled', emailVerificationDisabled(env));

  const rawFbDomain = typeof env.FIREBASE_AUTH_DOMAIN === 'string' ? env.FIREBASE_AUTH_DOMAIN.trim() : '';
  const firebaseAuthOrigin = rawFbDomain && /^[a-z0-9.-]+$/i.test(rawFbDomain)
    ? `https://${rawFbDomain}`
    : 'https://slink-ad8be.firebaseapp.com';

  await app.register(helmet, {
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'", 'https://www.gstatic.com', 'https://apis.google.com'],
        connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.googleapis.com'],
        frameSrc: ["'self'", firebaseAuthOrigin, 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com', 'https://www.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    },
  });
  await app.register(cookie);
  const googleVerification = parseGoogleSiteVerification(env);
  const verificationFiles = new Set(googleVerification.fileNames);
  const indexEntry = prepareIndexEntry(env, googleVerification.metaTokens);

  await app.register(rateLimit, {
    global: true,
    // Loading the frontend pulls dozens of assets. Keep those reads separate from the API limit.
    keyGenerator: (request) => isFrontendPath(request.url.split('?')[0], verificationFiles) ? request.ip + ':frontend' : request.ip,
    max: (request) => {
      if (env.NODE_ENV === 'test') return 2000;
      if (isFrontendPath(request.url.split('?')[0], verificationFiles)) return 1200;
      return request.url.startsWith('/api/stores/') ? 600 : 300;
    },
    timeWindow: '1 minute',
    errorResponseBuilder: () => Object.assign(
      new Error('Quá nhiều yêu cầu. Vui lòng thử lại sau.'),
      { statusCode: 429, code: 'rate_limit' }
    ),
  });
  await app.register(staticFiles, { root: APP_ROOT, prefix: '/', serve: false });

  app.addHook('onSend', async (request, reply, payload) => {
    const pathName = request.url.split('?')[0];
    reply.header('permissions-policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
    if (pathName.startsWith('/api/') || pathName === '/verify' || pathName === '/invite' || pathName.startsWith('/download/')) {
      reply.header('x-robots-tag', 'noindex, nofollow');
    }
    if (pathName.startsWith('/api/') && !reply.getHeader('cache-control')) {
      reply.header('cache-control', 'no-store');
    }
    if (ASSETS.has(pathName)) {
      reply.header('cache-control', pathName === '/sw.js'
        ? 'no-store'
        : LONG_LIVED_ASSETS.has(pathName) ? 'public, max-age=86400' : 'no-cache');
    }
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    request.log.info({
      method: request.method,
      route: request.routeOptions.url || '/api/:unmatched',
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(reply.elapsedTime),
    }, 'API request completed');
  });

  app.get('/download/android', async (_request, reply) => sendLatestAndroidApkRedirect(reply));
  app.get('/download/slink-latest.apk', async (_request, reply) => sendLatestAndroidApkRedirect(reply));
  app.get('/robots.txt', async (request, reply) => {
    const origin = resolvePublicOrigin(request, env);
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('text/plain; charset=utf-8')
      .send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /verify\nDisallow: /invite\nDisallow: /download/\nSitemap: ${origin}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', async (request, reply) => {
    const origin = resolvePublicOrigin(request, env);
    const legalLastMod = legalContent.LAST_UPDATED_ISO || SITEMAP_HOME_LASTMOD;
    const homeImages = [
      { loc: `${origin}/assets/slink-og-cover.png`, title: 'Slink — Phần mềm quản lý bán hàng POS và đa kho' },
      { loc: `${origin}/assets/slink-showcase-web-pos.webp`, title: 'Màn hình bán hàng tại quầy (POS) Slink trên máy tính' },
      { loc: `${origin}/assets/slink-showcase-web-dashboard.webp`, title: 'Tổng quan doanh thu, lãi gộp và tồn kho Slink' },
      { loc: `${origin}/assets/slink-showcase-mobile-pos.webp`, title: 'Ứng dụng bán hàng Slink trên điện thoại Android' },
    ]
      .map((img) => `\n    <image:image><image:loc>${img.loc}</image:loc><image:title>${img.title}</image:title></image:image>`)
      .join('');
    const entries = [
      `  <url>\n    <loc>${origin}/</loc>\n    <lastmod>${SITEMAP_HOME_LASTMOD}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>${homeImages}\n  </url>`,
      `  <url>\n    <loc>${origin}/legal/privacy</loc>\n    <lastmod>${legalLastMod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`,
      `  <url>\n    <loc>${origin}/legal/terms</loc>\n    <lastmod>${legalLastMod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`,
    ].join('\n');
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('application/xml; charset=utf-8')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries}\n</urlset>\n`);
  });
  for (const fileName of googleVerification.fileNames) {
    if (ASSETS.has(`/${fileName}`)) continue;
    app.get(`/${fileName}`, async (_request, reply) => reply
      .header('cache-control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(`google-site-verification: ${fileName}\n`));
  }
  app.get('/api/health', async () => ({ status: 'ok' }));
  app.get('/legal/terms', async (request, reply) => reply.type('text/html; charset=utf-8').send(legalContent.renderStandaloneLegalPage('terms', { origin: resolvePublicOrigin(request, env) })));
  app.get('/legal/privacy', async (request, reply) => reply.type('text/html; charset=utf-8').send(legalContent.renderStandaloneLegalPage('privacy', { origin: resolvePublicOrigin(request, env) })));
  app.get('/api/ready', async (_request, reply) => {
    if (!pool) return reply.code(503).send({ status: 'unavailable' });
    try {
      // Parse the live schema without reading customer rows. A reachable database
      // with missing release tables must not be reported ready for traffic.
      await pool.query(`SELECT p.batch_tracked, b.id, s.id
        FROM public.products p
        LEFT JOIN public.product_batches b ON false
        LEFT JOIN public.staff_shifts s ON false
        WHERE false`);
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  if (pool) {
    registerAuthRoutes(app, { pool, env, firebaseVerifier });
    registerProductRoutes(app, { pool, env });
    registerProductImageRoutes(app, { pool, env });
    registerSerialRoutes(app, { pool, env });
    registerAffiliateRoutes(app, { pool, env });
    registerSalesRoutes(app, { pool, env });
    registerPromotionRoutes(app, { pool, env });
    registerReturnRoutes(app, { pool, env });
    registerExchangeRoutes(app, { pool, env });
    registerOfflineConflictRoutes(app, { pool, env });
    registerRecordRoutes(app, { pool, env });
    registerStockRoutes(app, { pool, env });
    registerPaymentRoutes(app, { pool, env });
    registerPurchaseRoutes(app, { pool, env });
    registerSupplierReturnRoutes(app, { pool, env });
    registerPurchaseOrderRoutes(app, { pool, env });
    registerFinanceRoutes(app, { pool, env });
    registerAnalyticsRoutes(app, { pool, env });
    registerDashboardRoutes(app, { pool, env });
    registerStoreSettingsRoutes(app, { pool, env });
    registerExportRoutes(app, { pool, env });
    registerAccountingTt152Routes(app, { pool, env });
    registerAiAssistantRoutes(app, { pool, env, aiClient });
    registerStaffRoutes(app, { pool, env });
    registerCashRegisterRoutes(app, { pool, env });
    registerAuditRoutes(app, { pool, env });
    registerSecurityRoutes(app, { pool, env, firebaseVerifier });
    registerWarehouseRoutes(app, { pool, env });
    registerChannelMappingRoutes(app, { pool, env });
    registerChannelOrderRoutes(app, { pool, env });
    registerIntegrationRoutes(app, { pool, env });
    registerHrCrmRoutes(app, { pool, env });
    registerBatchRoutes(app, { pool, env });
    registerShiftRoutes(app, { pool, env });
  }

  for (const [route, fileName] of ASSETS) {
    if (route === '/sw.js') {
      app.get(route, async (_request, reply) => reply.header('cache-control', 'no-store').type('application/javascript; charset=utf-8').send(readFileSync(path.join(APP_ROOT, fileName), 'utf8').replace('__SLINK_ASSET_VERSION__', APP_ASSET_VERSION)));
    } else if (fileName === 'index.html') {
      app.get(route, async (request, reply) => serveCachedTextAsset(request, reply, indexEntry));
    } else if (STATIC_TEXT_CACHE.has(fileName)) {
      const entry = STATIC_TEXT_CACHE.get(fileName);
      app.get(route, async (request, reply) => serveCachedTextAsset(request, reply, entry));
    } else app.get(route, async (_request, reply) => reply.sendFile(fileName));
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Không tìm thấy chức năng này.' } });
    }
    return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
  });

  app.setErrorHandler((error, request, reply) => {
    const isRateLimitError = error?.code === 'rate_limit';
    if (error?.code === 'email_unavailable') {
      request.log.warn({ code: error.code, ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) }, 'Email delivery failed');
    } else if (!(error instanceof ApiError) && !isRateLimitError) {
      request.log.error({ route: request.routeOptions.url || '/api/:unmatched', err: error }, 'Request failed');
    }
    const safeApiErrorStatus = error instanceof ApiError
      && Number.isInteger(error.statusCode)
      && error.statusCode >= 400
      && error.statusCode < 600
      && error.statusCode !== 500;
    const safeClientStatus = Number.isInteger(error.statusCode)
      && error.statusCode >= 400
      && error.statusCode < 500;
    const statusCode = isRateLimitError
      ? 429
      : (safeApiErrorStatus ? error.statusCode : (safeClientStatus ? error.statusCode : 500));
    const internalFailure = statusCode >= 500 && !safeApiErrorStatus;
    return reply.code(statusCode).send({
      error: {
        code: internalFailure ? 'internal_error' : (error.code || 'request_error'),
        message: internalFailure ? 'Đã xảy ra lỗi. Vui lòng thử lại.' : error.message,
      },
    });
  });

  if (pool) app.addHook('onClose', async () => pool.end());
  return app;
}

async function main() {
  const envFile = path.resolve(APP_ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  validateProductionConfig(process.env);
  const pool = createPool();
  const app = await buildServer({ pool });
  try {
    const maxAttempts = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production' ? 24 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await assertRuntimeSchema(pool);
        break;
      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        app.log.warn({ attempt, maxAttempts, err: err.message }, 'Waiting for database schema migration to complete...');
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  } catch (error) {
    await app.close();
    throw error;
  }
  if (emailVerificationDisabled(process.env)) {
    app.log.warn('Demo mode is enabled: store-owner sign-up skips email verification. Turn it off after the demonstration.');
  }
  const port = Number(process.env.PORT || 3000);
  // Render's proxy cannot reach a listener bound only to loopback, even if HOST
  // was set to 127.0.0.1 in the service dashboard.
  const host = process.env.RENDER === 'true'
    ? '0.0.0.0'
    : (process.env.HOST || '127.0.0.1');
  await app.listen({ port, host });
  app.log.info({ address: `http://${host}:${port}` }, 'Slink API listening');
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Slink failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildServer, validateProductionConfig };
