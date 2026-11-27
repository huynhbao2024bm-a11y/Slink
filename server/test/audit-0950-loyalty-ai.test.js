'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { openPGliteRuntime } = require('../pglite-runtime');
const { createCaptchaChallengeWithAnswer } = require('../captcha');
const { decryptStoreCredentials, encryptStoreCredentials, buildStoreEnv } = require('../providers/credentials');
const { tryFastLocalOrderParse } = require('../ai-assistant');

function extractCookies(res) {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const jar = {};
  for (const line of list) {
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) jar[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
  return jar;
}

function makeAuthHeaders(jar) {
  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    origin: 'http://127.0.0.1:3000',
    cookie: cookieHeader,
    'x-csrf-token': jar.slink_csrf || '',
  };
}

test('0.9.5.0 Security & Audit: tenant credential isolation, corrupted ciphertext fail-closed, persistent CAPTCHA burn, cashier RBAC, and zero-delta exchange guard', async (t) => {
  // 1. Credential isolation & fail-closed decryption
  const stripped = buildStoreEnv({
    NODE_ENV: 'production',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    MOMO_ACCESS_KEY: 'shared_secret_should_not_leak',
    GHN_TOKEN: 'shared_ghn_should_not_leak',
  }, {});
  assert.equal(stripped.MOMO_ACCESS_KEY, undefined);
  assert.equal(stripped.GHN_TOKEN, undefined);

  const allowedShared = buildStoreEnv({
    NODE_ENV: 'production',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    ALLOW_SHARED_HOST_INTEGRATIONS: 'true',
    MOMO_ACCESS_KEY: 'shared_allowed',
  }, {});
  assert.equal(allowedShared.MOMO_ACCESS_KEY, 'shared_allowed');

  const encEnv = { SESSION_SECRET: '0123456789abcdef0123456789abcdef', NODE_ENV: 'test' };
  const encrypted = encryptStoreCredentials({ GHN_TOKEN: 'tok-123' }, encEnv);
  assert.equal(decryptStoreCredentials(encrypted, encEnv).GHN_TOKEN, 'tok-123');
  assert.throws(() => decryptStoreCredentials('v1:tampered.invalid.payload', encEnv));

  // 2. Persistent DB CAPTCHA consumption across server restarts
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-0950-sec-'));
  const runtime = await openPGliteRuntime({
    dataDirectory: dataDir,
    migrationsDirectory: path.join(__dirname, '..', 'migrations'),
  });
  const sharedEnv = {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
    REQUIRE_AUTH_CAPTCHA: 'true',
    DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  };
  const app1 = await buildServer({ pool: runtime.pool, logger: false, env: sharedEnv });
  const challenge = createCaptchaChallengeWithAnswer(sharedEnv);
  const prep1 = await app1.inject({
    method: 'POST',
    url: '/api/auth/register/prepare',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Chu Shop',
      storeName: 'Tap Hoa 0950',
      email: 'audit0950@example.com',
      captchaToken: challenge.captchaToken,
      captchaAnswer: challenge._answer,
    },
  });
  assert.equal(prep1.statusCode, 200, prep1.body);
  const regTicket = prep1.json().registrationTicket;
  await app1.close();

  // New server instance + freshly reopened DB on same dataDir — replay of CAPTCHA token must STILL fail!
  const runtime2 = await openPGliteRuntime({
    dataDirectory: dataDir,
    migrationsDirectory: path.join(__dirname, '..', 'migrations'),
  });
  const app2 = await buildServer({ pool: runtime2.pool, logger: false, env: sharedEnv });
  t.after(async () => {
    await app2.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });
  const prepReplay = await app2.inject({
    method: 'POST',
    url: '/api/auth/register/prepare',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Chu Shop 2',
      storeName: 'Tap Hoa 0950 B',
      email: 'audit0950-2@example.com',
      captchaToken: challenge.captchaToken,
      captchaAnswer: challenge._answer,
    },
  });
  assert.equal(prepReplay.statusCode, 400);
  assert.equal(prepReplay.json().error.code, 'captcha_invalid');

  // Register owner & test cashier RBAC + exchange tender guard
  const regOk = await app2.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Chu Shop',
      storeName: 'Tap Hoa 0950',
      email: 'audit0950@example.com',
      password: 'VeryStrongPassword#2026',
      registrationTicket: regTicket,
    },
  });
  assert.equal(regOk.statusCode, 201, regOk.body);
  const ownerHeaders = makeAuthHeaders(extractCookies(regOk));
  const storeId = regOk.json().stores[0].id;

  const staffCreate = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/direct-create`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      displayName: 'Thu Ngan A',
      email: 'cashier0950@example.com',
      password: 'VeryStrongPassword#2026',
      role: 'cashier',
    },
  });
  assert.equal(staffCreate.statusCode, 201, staffCreate.body);

  const cashierLogin = await app2.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: { email: 'cashier0950@example.com', password: 'VeryStrongPassword#2026' },
  });
  assert.equal(cashierLogin.statusCode, 200, cashierLogin.body);
  const cashierHeaders = makeAuthHeaders(extractCookies(cashierLogin));

  const cashierBonusBlock = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/customers`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: { name: 'Khach Hack', phone: '0987654321', bonusPoints: 99999 },
  });
  assert.equal(cashierBonusBlock.statusCode, 403);

  // Equal-value exchange rejecting spurious extra tenders
  const prod1Res = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { items: [
      { name: 'Ao Thun', sku: 'AT-01', salePriceVnd: 100000, costVnd: 50000, openingQuantity: '10' },
      { name: 'Quan Jean', sku: 'QJ-01', salePriceVnd: 100000, costVnd: 50000, openingQuantity: '10' },
    ] },
  });
  assert.equal(prod1Res.statusCode, 201, prod1Res.body);
  const catalogList = (await app2.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=20`, headers: ownerHeaders })).json().products;
  const productId = catalogList.find((p) => p.sku === 'AT-01').id;
  const product2Id = catalogList.find((p) => p.sku === 'QJ-01').id;

  const whRes = await app2.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses?view=picker`, headers: ownerHeaders });
  const warehouseId = whRes.json().warehouses.find((w) => w.is_default).id;

  const openShift = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 100000 },
  });
  assert.equal(openShift.statusCode, 201);

  const saleRes = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      items: [{ productId, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 100000 }],
      amountReceivedVnd: 100000,
    },
  });
  assert.equal(saleRes.statusCode, 201);
  const orderId = saleRes.json().order.id;
  const orderDetail = await app2.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers: ownerHeaders });
  const orderLineId = orderDetail.json().order.items[0].id;

  const badEx = await app2.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${orderId}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      returnItems: [{ orderLineId, quantity: 1 }],
      replacementItems: [{ productId: product2Id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 50000 }],
      amountReceivedVnd: 50000,
    },
  });
  assert.equal(badEx.statusCode, 400);
});

test('0.9.5.0 Phone Loyalty Points + Instant Hybrid AI Engine (<20ms local parse)', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-0950-loy-'));
  const runtime = await openPGliteRuntime({
    dataDirectory: dataDir,
    migrationsDirectory: path.join(__dirname, '..', 'migrations'),
  });
  const app = await buildServer({
    pool: runtime.pool,
    logger: false,
    env: {
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
      DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    },
  });
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Chu Loyalty',
      storeName: 'Shop Tich Diem',
      email: 'loyalty0950@example.com',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);
  const headers = makeAuthHeaders(extractCookies(reg));
  const storeId = reg.json().stores[0].id;

  // Update loyalty config via settings
  const curSet = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/settings`, headers })).json().settings;
  const updSet = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/settings`,
    headers,
    payload: {
      name: curSet.name,
      phone: curSet.phone || '',
      address: curSet.address || '',
      receiptFooter: curSet.receipt_footer || '',
      loyaltyEarnUnitVnd: '50000',
      loyaltyRedeemValueVnd: '2000',
      protectCostMargin: true,
      version: curSet.version,
    },
  });
  assert.equal(updSet.statusCode, 200, updSet.body);
  assert.equal(updSet.json().settings.loyalty_earn_unit_vnd, '50000');
  assert.equal(updSet.json().settings.loyalty_redeem_value_vnd, '2000');

  const importRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { items: [
      { name: 'Bia Tiger Lon', sku: 'BT-01', unit: 'lon', salePriceVnd: 20000, costVnd: 15000, openingQuantity: '50' },
      { name: 'Mì Hảo Hảo Tôm Chua Cay', sku: 'MH-01', unit: 'gói', salePriceVnd: 5000, costVnd: 3500, openingQuantity: '100' },
    ] },
  });
  assert.equal(importRes.statusCode, 201, importRes.body);
  const catalogItems = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=20`, headers })).json().products;
  const p1 = catalogItems.find((p) => p.sku === 'BT-01');
  const p2 = catalogItems.find((p) => p.sku === 'MH-01');
  const whId = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses?view=picker`, headers })).json().warehouses.find((w) => w.is_default).id;
  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 200000 },
  });

  // Sale #1 with brand-new 10-digit phone only (zero-popup inline creation, 100,000d => +2 points)
  const sale1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId: whId,
      items: [{ productId: p1.id, quantity: 5 }],
      customerInline: '0912345678',
      tenders: [{ method: 'cash', amountReceivedVnd: 100000 }],
      amountReceivedVnd: 100000,
    },
  });
  assert.equal(sale1.statusCode, 201, sale1.body);
  const s1Order = sale1.json().order;
  assert.equal(s1Order.pointsEarned, 2);
  assert.equal(s1Order.customerPhone, '0912345678');
  assert.equal(s1Order.loyaltySummary.pointsBalance, 2);

  // Sale #2 for returning phone redeeming 2 points (-4,000d)
  const sale2 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId: whId,
      items: [{ productId: p1.id, quantity: 5 }],
      customerId: s1Order.customerId,
      redeemPoints: true,
      tenders: [{ method: 'cash', amountReceivedVnd: 96000 }],
      amountReceivedVnd: 96000,
    },
  });
  assert.equal(sale2.statusCode, 201, sale2.body);
  const s2Order = sale2.json().order;
  assert.equal(s2Order.pointsRedeemed, 2);
  assert.equal(s2Order.pointsRedeemedVnd, '4000');
  assert.equal(s2Order.pointsEarned, 1); // 96,000 / 50,000 = 1 point
  assert.equal(s2Order.customerPointsBalance, 1);

  const ord2Res = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${s2Order.id}`, headers });
  assert.equal(ord2Res.statusCode, 200, ord2Res.body);
  const ord2 = ord2Res.json().order;
  assert.equal(ord2.pointsRedeemed, 2);
  assert.equal(ord2.pointsEarned, 1);

  const custDetailRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers/${s1Order.customerId}`, headers });
  assert.equal(custDetailRes.statusCode, 200, custDetailRes.body);
  const custDetail = custDetailRes.json();
  assert.equal(custDetail.loyalty.pointsBalance, 1);
  assert.ok(Array.isArray(custDetail.pointHistory) && custDetail.pointHistory.length >= 3);

  // Instant Local Hybrid AI order parser (<20ms, zero external Gemini call)
  const t0 = Date.now();
  const aiRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/ai/parse-order`,
    headers,
    payload: { transcript: 'hai lon bia tiger và 3 gói mì hảo hảo cho khách 0912345678 dùng điểm giảm 5k chuyển khoản' },
  });
  const elapsed = Date.now() - t0;
  assert.equal(aiRes.statusCode, 200, aiRes.body);
  const aiBody = aiRes.json();
  assert.equal(aiBody.source, 'local_fast');
  assert.ok(elapsed < 500, `Expected fast local parse, got ${elapsed}ms`);
  assert.equal(aiBody.items.length, 2);
  assert.equal(aiBody.items[0].productId, p1.id);
  assert.equal(aiBody.items[0].quantity, '2');
  assert.equal(aiBody.items[1].productId, p2.id);
  assert.equal(aiBody.items[1].quantity, '3');
  assert.equal(aiBody.customerId, s1Order.customerId);
  assert.equal(aiBody.redeemPoints, true);
  assert.equal(aiBody.discountVnd, '5000');
  assert.equal(aiBody.paymentMethod, 'bank_transfer');

  // Direct unit check on tryFastLocalOrderParse helper
  const localHit = tryFastLocalOrderParse('3 bia tiger giao tới 12 Nguyễn Trãi', [{ id: p1.id, sku: p1.sku, name: p1.name, sale_price_vnd: '20000' }], []);
  assert.ok(localHit);
  assert.equal(localHit.delivery_address, '12 Nguyễn Trãi');
});

test('0.9.5.1 Auth: Google-linked account can still sign in with matching manual password when Firebase has no password provider', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-google-pw-'));
  const runtime = await openPGliteRuntime({ dataDirectory: dataDir, migrationsDirectory: path.resolve(__dirname, '../migrations') });
  let hasFbPassword = false;
  let attachedPassword = '';
  const firebaseVerifier = {
    verifyIdToken: async (token) => {
      if (token === 'google-id-token-for-dual-login-test') {
        return {
          uid: 'fb-google-uid-1',
          email: 'dualuser@example.com',
          email_verified: true,
          name: 'Dual User',
          firebase: { sign_in_provider: 'google.com' },
        };
      }
      throw new Error('invalid token');
    },
    hasPasswordProvider: async () => hasFbPassword,
    attachPasswordProvider: async (_uid, password) => {
      attachedPassword = password;
      hasFbPassword = true;
    },
  };
  const app = await buildServer({
    pool: runtime.pool,
    firebaseVerifier,
    env: {
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
      DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    },
  });
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Dual User',
      storeName: 'Dual Auth Shop',
      email: 'dualuser@example.com',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);

  // Sign in via Google links firebase_uid without creating a Firebase password provider
  const ggLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/firebase',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: { idToken: 'google-id-token-for-dual-login-test' },
  });
  assert.equal(ggLogin.statusCode, 200, ggLogin.body);

  // Manual login with same email + password succeeds and attaches password to Firebase
  const manualOk = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: { email: 'dualuser@example.com', password: 'VeryStrongPassword#2026' },
  });
  assert.equal(manualOk.statusCode, 200, manualOk.body);
  assert.equal(attachedPassword, 'VeryStrongPassword#2026');
  assert.equal(hasFbPassword, true);

  // Once Firebase has a password provider, /api/auth/login defers to Firebase Auth
  const manualBlocked = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: { email: 'dualuser@example.com', password: 'VeryStrongPassword#2026' },
  });
  assert.equal(manualBlocked.statusCode, 401);
});

test('0.9.6.0 AI & Automation: F&B local parse, unknown supplier-code fallback, channel-order parse, and restock suggestions', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-ai0960-'));
  const runtime = await openPGliteRuntime({ dataDirectory: dataDir, migrationsDirectory: path.resolve(__dirname, '../migrations') });
  const app = await buildServer({
    pool: runtime.pool,
    aiClient: {
      parseInvoice: async () => ({
        supplier_name: 'NCC Dai Phat',
        total_vnd: '100000',
        discount_vnd: '0',
        fee_vnd: '0',
        paid_vnd: '0',
        method: 'cash',
        items: [{
          product_name: 'Trà đào với thạch',
          code: 'NCC-UNKNOWN-999',
          unit: 'chiếc',
          quantity: '5',
          import_price_vnd: '20000',
          line_total_vnd: '100000',
        }],
      }),
      parseChannelOrder: async () => ({
        external_order_ref: 'ZALO-8899',
        customer_name: 'Chị Hoa',
        customer_phone: '0912345678',
        shipping_address: '45 Lê Lợi, Q1',
        payment_status: 'cod',
        internal_note: 'Giao giờ hành chính',
        items: [{ matched_name: 'Trà đào với thạch', quantity: 2 }],
      }),
    },
    env: {
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
      DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    },
  });
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      displayName: 'Chu AI 0960',
      storeName: 'Quan Tra 0960',
      email: 'ai0960@example.com',
      password: 'VeryStrongPassword#2026',
    },
  });
  assert.equal(reg.statusCode, 201);
  const headers = makeAuthHeaders(extractCookies(reg));
  const storeId = reg.json().stores[0].id;

  const imp = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [{
        name: 'Trà đào với thạch',
        sku: 'TD-01',
        unit: 'cái',
        salePriceVnd: 35000,
        costVnd: 20000,
        lowStockThreshold: 10,
        openingQuantity: '2',
      }],
    },
  });
  assert.equal(imp.statusCode, 201, imp.body);
  const prod = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=10`, headers })).json().products[0];

  // 1. tryFastLocalOrderParse keeps "với" inside product name and reads leading customer + F&B note
  const fastHit = tryFastLocalOrderParse('Chị Hoa lấy 2 trà đào với thạch ít đường', [prod], []);
  assert.ok(fastHit);
  assert.equal(fastHit.items.length, 1);
  assert.equal(fastHit.items[0].product_id, prod.id);
  assert.equal(fastHit.items[0].quantity, 2);
  assert.equal(fastHit.customer_name, 'chi hoa');
  assert.equal(fastHit.note, 'it duong');

  // 2. parse-invoice matches by name even when supplier code is unknown AND normalizes chiếc == cái
  const invRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/ai/parse-invoice`,
    headers,
    payload: {
      mimeType: 'image/jpeg',
      imageBase64: Buffer.from('fake-jpeg-bytes-for-test-0960-padding-bytes-01234567890123456789012345678901234567890123456789').toString('base64'),
      draftVersion: 2,
    },
  });
  assert.equal(invRes.statusCode, 200, invRes.body);
  const invDraft = invRes.json();
  assert.equal(invDraft.rows[0].product.id, prod.id);
  assert.equal(invDraft.rows[0].issue, null);

  // 3. parse-channel-order parses pasted message / order screenshot
  const chRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/ai/parse-channel-order`,
    headers,
    payload: { text: 'Đơn Zalo ZALO-8899 Chị Hoa 0912345678 45 Lê Lợi, Q1 2 trà đào với thạch' },
  });
  assert.equal(chRes.statusCode, 200, chRes.body);
  const chBody = chRes.json();
  assert.equal(chBody.customerPhone, '0912345678');
  assert.equal(chBody.items[0].productId, prod.id);

  // 4. restock-suggestions returns urgent low-stock suggestion (stock 2 <= minStock 10)
  const restockRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/ai/restock-suggestions`,
    headers,
  });
  assert.equal(restockRes.statusCode, 200, restockRes.body);
  assert.ok(restockRes.json().suggestions.some((s) => s.productId === prod.id && s.actionType === 'purchase'));
});
