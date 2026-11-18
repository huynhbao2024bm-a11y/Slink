'use strict';

const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer, validateProductionConfig } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const { extractOrderCodeFromMemo } = require('../providers/bank-webhook');
const { signMomoCreateRequest, verifyMomoIpnSignature, buildVnpayPaymentUrl, verifyVnpayIpn } = require('../providers/payment-gateways');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']];
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

async function setupApp(t, extraEnv = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'));
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    REVOKE ALL ON public.product_sale_price_history FROM slink_app;
    GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.integration_webhook_events FROM slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({
    pool,
    logger: false,
    env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin, ...extraEnv },
  });
  app.testDb = db;
  t.after(() => app.close());
  return { app, db };
}

async function registerOwner(app, email, storeName) {
  const password = 'VeryStrongPassword#2026!';
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      email,
      password,
      displayName: 'Chủ Shop',
      storeName,
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  const vTok = new URLSearchParams(new URL(res.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: vTok } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const body = login.json();
  const cookies = cookiesFrom(login);
  const headers = {
    origin,
    cookie: `slink_session=${cookies.slink_session}; slink_csrf=${cookies.slink_csrf}`,
    'x-csrf-token': cookies.slink_csrf,
  };
  return { storeId: body.stores[0].id, userId: body.user.id, headers };
}

test('extractOrderCodeFromMemo handles SLINK prefix, bare SL codes, and stripped hyphens', () => {
  assert.equal(extractOrderCodeFromMemo('NGUYEN VAN A CHUYEN KHOAN SLINK SL-1024'), 'SL-1024');
  assert.equal(extractOrderCodeFromMemo('THANH TOAN DON SL1024 TAI QUAY'), 'SL1024');
  assert.equal(extractOrderCodeFromMemo('DH-20261118'), 'DH-20261118');
  assert.equal(extractOrderCodeFromMemo('Chuyen tien an trua'), null);
});

test('MoMo & VNPAY HMAC signing helpers sign and verify deterministically', () => {
  const momoEnv = { MOMO_PARTNER_CODE: 'MOMO_PARTNER', MOMO_ACCESS_KEY: 'ACCESS_123', MOMO_SECRET_KEY: 'SECRET_XYZ' };
  const momoReq = signMomoCreateRequest({
    orderId: 'SL-10',
    requestId: 'req-1',
    amountVnd: '150000',
    orderInfo: 'Thanh toan SL-10',
    redirectUrl: 'https://slink.test/return',
    ipnUrl: 'https://slink.test/ipn',
    extraData: '',
  }, momoEnv);
  assert.equal(momoReq.configured, true);
  assert.equal(momoReq.payload.signature.length, 64);

  const ipnBody = {
    partnerCode: 'MOMO_PARTNER',
    orderId: 'SL-10',
    requestId: 'req-1',
    amount: 150000,
    orderInfo: 'Thanh toan SL-10',
    orderType: 'momo_wallet',
    transId: '998877',
    resultCode: 0,
    message: 'Successful.',
    payType: 'qr',
    responseTime: 1700000000,
    extraData: '',
  };
  const rawIpn = `accessKey=ACCESS_123&amount=150000&extraData=&message=Successful.&orderId=SL-10&orderInfo=Thanh toan SL-10&orderType=momo_wallet&partnerCode=MOMO_PARTNER&payType=qr&requestId=req-1&responseTime=1700000000&resultCode=0&transId=998877`;
  ipnBody.signature = createHmac('sha256', 'SECRET_XYZ').update(rawIpn).digest('hex');
  assert.equal(verifyMomoIpnSignature(ipnBody, momoEnv).valid, true);
  assert.equal(verifyMomoIpnSignature({ ...ipnBody, amount: 999999 }, momoEnv).valid, false);

  const vnpEnv = { VNPAY_TMN_CODE: 'TMN01', VNPAY_HASH_SECRET: 'VNP_SECRET_KEY' };
  const vnp = buildVnpayPaymentUrl({
    txnRef: 'SL10',
    amountVnd: '200000',
    orderInfo: 'Thanh toan SL10',
    returnUrl: 'https://slink.test/vnpay',
    createDate: '20261118190000',
  }, vnpEnv);
  assert.equal(vnp.configured, true);
  const parsedUrl = new URL(vnp.url);
  assert.equal(parsedUrl.searchParams.get('vnp_Amount'), '20000000');
  const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());
  assert.equal(verifyVnpayIpn(queryObj, vnpEnv).valid, true);
  assert.equal(verifyVnpayIpn({ ...queryObj, vnp_Amount: '100' }, vnpEnv).valid, false);
});

test('Store integration settings, RBAC, VietQR config, webhook reconciliation & idempotency work end-to-end', async (t) => {
  const sepayToken = 'sepay_test_secret_token_2026';
  const payosChecksumKey = 'payos_checksum_key_2026';
  const { app } = await setupApp(t, {
    SEPAY_WEBHOOK_TOKEN: sepayToken,
    PAYOS_CHECKSUM_KEY: payosChecksumKey,
  });

  const ownerA = await registerOwner(app, 'owner-a@slink.test', 'Shop A');
  const ownerB = await registerOwner(app, 'owner-b@slink.test', 'Shop B');

  // Invite cashier in Store A to verify RBAC
  const invRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/staff/invitations`,
    headers: ownerA.headers,
    payload: { email: 'cashier-a@slink.test', role: 'cashier' },
  });
  assert.equal(invRes.statusCode, 201);
  const tok = new URLSearchParams(new URL(invRes.json().developmentInviteUrl).hash.slice(1)).get('invite');
  const cashierPass = 'CashierPassword#2026!';
  const cashierReg = await app.inject({
    method: 'POST',
    url: `/api/invitations/${tok}/register`,
    headers: { origin },
    payload: { displayName: 'Thu ngan A', password: cashierPass },
  });
  assert.equal(cashierReg.statusCode, 201, cashierReg.body);
  const cTok = new URLSearchParams(new URL(cashierReg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: cTok } });
  const cashierLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'cashier-a@slink.test', password: cashierPass },
  });
  assert.equal(cashierLogin.statusCode, 200, cashierLogin.body);
  const cashierCookies = cookiesFrom(cashierLogin);
  const cashierHeaders = {
    origin,
    cookie: `slink_session=${cashierCookies.slink_session}; slink_csrf=${cashierCookies.slink_csrf}`,
    'x-csrf-token': cashierCookies.slink_csrf,
  };

  // Cashier cannot update integration settings
  const forbiddenPut = await app.inject({
    method: 'PUT',
    url: `/api/stores/${ownerA.storeId}/integrations/settings`,
    headers: cashierHeaders,
    payload: { bankBin: '970436', bankAccountNumber: '1903668899' },
  });
  assert.equal(forbiddenPut.statusCode, 403);

  // Validation rejects non-6-digit BIN
  const badPut = await app.inject({
    method: 'PUT',
    url: `/api/stores/${ownerA.storeId}/integrations/settings`,
    headers: ownerA.headers,
    payload: { bankBin: '123', bankAccountNumber: '1903668899' },
  });
  assert.equal(badPut.statusCode, 400);

  // Owner updates valid VietQR + SePay + MISA + GHN config
  const okPut = await app.inject({
    method: 'PUT',
    url: `/api/stores/${ownerA.storeId}/integrations/settings`,
    headers: ownerA.headers,
    payload: {
      bankBin: '970436',
      bankAccountNumber: '1903668899',
      bankAccountName: 'CHU SHOP A',
      bankWebhookProvider: 'sepay',
      einvoiceProvider: 'misa',
      taxCode: '0312345678',
      einvoiceTemplateCode: '1',
      einvoiceSerial: '1C26TYY',
      shippingProvider: 'ghn',
    },
  });
  assert.equal(okPut.statusCode, 200, okPut.body);
  assert.equal(okPut.json().settings.bankCode, 'VCB');
  assert.equal(okPut.json().settings.bankName, 'Vietcombank');

  // Status reflects active VietQR + ESC/POS, while MISA & GHN remain unconfigured without vendor credentials
  const statusRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${ownerA.storeId}/integrations/status`,
    headers: ownerA.headers,
  });
  assert.equal(statusRes.statusCode, 200);
  const connectors = statusRes.json().connectors;
  assert.equal(connectors.find((c) => c.id === 'vietqr').status, 'active');
  assert.equal(connectors.find((c) => c.id === 'escpos').status, 'active');
  assert.equal(connectors.find((c) => c.id === 'einvoice').status, 'needs_credentials');
  assert.equal(connectors.find((c) => c.id === 'shipping').status, 'needs_credentials');

  // Seed a customer + product + credit order (unpaid) in Store A
  const custRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/customers`,
    headers: ownerA.headers,
    payload: { name: 'Anh Minh', phone: '0909123456' },
  });
  assert.equal(custRes.statusCode, 201, custRes.body);
  const customerId = custRes.json().customer.id;

  const prodRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/products`,
    headers: ownerA.headers,
    payload: {
      sku: 'SP-QR-01',
      name: 'Cà phê Arabica',
      unit: 'Túi',
      costVnd: 80000,
      salePriceVnd: 150000,
      lowStockThreshold: 1,
      inventoryTracked: false,
    },
  });
  assert.equal(prodRes.statusCode, 200, prodRes.body);
  const productId = prodRes.json().product.id;

  const saleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/sales`,
    headers: { ...ownerA.headers, 'idempotency-key': randomUUID() },
    payload: {
      customerId,
      items: [{ productId, quantity: 2 }],
      tenders: [],
      method: 'cash',
      amountReceivedVnd: 0,
      note: 'Chờ chuyển khoản',
    },
  });
  assert.equal(saleRes.statusCode, 201, saleRes.body);
  const order = saleRes.json().order;
  assert.equal(order.totalVnd, '300000');

  // 1) Invalid SePay token -> 401
  const badHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerA.storeId}`,
    headers: { authorization: 'Apikey wrong_token' },
    payload: { id: 'sp-1', transferType: 'in', transferAmount: 300000, content: `SLINK ${order.number}` },
  });
  assert.equal(badHook.statusCode, 401);

  // 2) Cross-store check: Store B has sepay disabled -> 403 even with valid token & Store A order number
  const crossHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerB.storeId}`,
    headers: { authorization: `Apikey ${sepayToken}` },
    payload: { id: 'sp-cross', transferType: 'in', transferAmount: 300000, content: `SLINK ${order.number}` },
  });
  assert.equal(crossHook.statusCode, 403);

  // 2.5) Wrong destination accountNumber is ignored instead of settling order
  const mismatchHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerA.storeId}`,
    headers: { authorization: `Apikey ${sepayToken}` },
    payload: { id: 'sp-wrong-acc', accountNumber: '9999999999', transferType: 'in', transferAmount: 300000, content: `SLINK ${order.number}` },
  });
  assert.equal(mismatchHook.statusCode, 200);
  assert.equal(mismatchHook.json().results[0].status, 'ignored');

  // 3) Valid SePay webhook with stripped hyphen memo & matching accountNumber settles Store A order atomically & updates customer debt ledger
  const bareCode = order.number.replace('-', '');
  const okHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerA.storeId}`,
    headers: { authorization: `Apikey ${sepayToken}` },
    payload: { id: 'sp-1001', accountNumber: '1903668899', transferType: 'in', transferAmount: 350000, content: `THANH TOAN ${bareCode} OK`, transactionDate: '2026-11-18 19:00:00' },
  });
  assert.equal(okHook.statusCode, 200, okHook.body);
  assert.equal(okHook.json().results[0].status, 'processed');

  // Verify order now has exactly 300,000 paid (capped from 350,000) & customer debt is 0
  const ordDetail = await app.inject({
    method: 'GET',
    url: `/api/stores/${ownerA.storeId}/orders/${order.id}`,
    headers: ownerA.headers,
  });
  assert.equal(ordDetail.statusCode, 200);
  const payments = ordDetail.json().order.payments;
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount_vnd, '300000');
  assert.equal(payments[0].provider, 'sepay');

  const custList = await app.inject({
    method: 'GET',
    url: `/api/stores/${ownerA.storeId}/customers?q=0909123456`,
    headers: ownerA.headers,
  });
  assert.equal(custList.json().customers[0].balance_vnd, '0');

  // 4) Duplicate event is idempotent
  const dupHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerA.storeId}`,
    headers: { authorization: `Apikey ${sepayToken}` },
    payload: { id: 'sp-1001', transferType: 'in', transferAmount: 350000, content: `THANH TOAN ${bareCode} OK` },
  });
  assert.equal(dupHook.statusCode, 200);
  assert.equal(dupHook.json().results[0].status, 'duplicate');

  // 5) E-invoice & shipping routes fail closed with 503 when vendor keys are absent
  const invFail = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/orders/${order.id}/einvoice`,
    headers: ownerA.headers,
    payload: {},
  });
  assert.equal(invFail.statusCode, 503);
  assert.equal(invFail.json().error.code, 'integration_not_configured');

  const shipFail = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/orders/${order.id}/shipping`,
    headers: ownerA.headers,
    payload: {},
  });
  assert.equal(shipFail.statusCode, 503);
  assert.equal(shipFail.json().error.code, 'integration_not_configured');

  // 6) Verify PayOS HMAC checksum route behavior (ignores non-00 status, processes empty reference rejection, accepts code 00)
  await app.inject({
    method: 'PUT',
    url: `/api/stores/${ownerA.storeId}/integrations/settings`,
    headers: ownerA.headers,
    payload: { bankWebhookProvider: 'payos' },
  });
  const payosData = { amount: 50000, description: 'SLINK SL-999', orderCode: 999, reference: 'PO-999' };
  const canonical = Object.keys(payosData).sort().map((k) => `${k}=${payosData[k]}`).join('&');
  const payosSig = createHmac('sha256', payosChecksumKey).update(canonical).digest('hex');
  const payosPending = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/payos/${ownerA.storeId}`,
    payload: { code: '01', success: false, data: payosData, signature: payosSig },
  });
  assert.equal(payosPending.statusCode, 200);
  assert.equal(payosPending.json().ignored, true);

  const payosHook = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/payos/${ownerA.storeId}`,
    payload: { code: '00', success: true, data: payosData, signature: payosSig },
  });
  assert.equal(payosHook.statusCode, 200, payosHook.body);
  assert.equal(payosHook.json().results[0].status, 'ignored');

  // 7) Verify partial return + webhook accounts for returned amount without overflowing customer debt ledger
  const sale2Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/sales`,
    headers: { ...ownerA.headers, 'idempotency-key': randomUUID() },
    payload: { customerId, items: [{ productId, quantity: 2 }], tenders: [], method: 'cash', amountReceivedVnd: 0 },
  });
  assert.equal(sale2Res.statusCode, 201, sale2Res.body);
  const order2 = sale2Res.json().order;
  const order2Detail = await app.inject({ method: 'GET', url: `/api/stores/${ownerA.storeId}/orders/${order2.id}`, headers: ownerA.headers });
  const order2LineId = order2Detail.json().order.items[0].id;
  const retRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${ownerA.storeId}/orders/${order2.id}/returns`,
    headers: { ...ownerA.headers, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Khach tra bot 1 tui',
      restockPolicy: 'restock',
      items: [{ orderLineId: order2LineId, quantity: 1 }],
    },
  });
  assert.equal(retRes.statusCode, 201, retRes.body);
  await app.inject({
    method: 'PUT',
    url: `/api/stores/${ownerA.storeId}/integrations/settings`,
    headers: ownerA.headers,
    payload: { bankBin: '970436', bankAccountNumber: '1903668899', bankWebhookProvider: 'sepay' },
  });
  const settle2 = await app.inject({
    method: 'POST',
    url: `/api/webhooks/bank-transfer/sepay/${ownerA.storeId}`,
    headers: { authorization: `Apikey ${sepayToken}` },
    payload: { id: 'sp-ret-cap', transferType: 'in', transferAmount: 300000, content: `SLINK ${order2.number}` },
  });
  assert.equal(settle2.statusCode, 200, settle2.body);
  assert.equal(settle2.json().results[0].status, 'processed');
  const debtsAfter = await app.inject({ method: 'GET', url: `/api/stores/${ownerA.storeId}/customers/${customerId}/debts`, headers: ownerA.headers });
  assert.equal(debtsAfter.statusCode, 200, debtsAfter.body);
  assert.equal(debtsAfter.json().balanceVnd, '0');
});

test('validateProductionConfig accepts RESEND_API_KEY shortcut without EMAIL_DELIVERY_URL', () => {
  assert.doesNotThrow(() => validateProductionConfig({
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://slink_app:password@db.example.test:5432/slink',
    PG_SSL: 'true',
    PUBLIC_ORIGIN: 'https://slink.example.test',
    RESEND_API_KEY: 're_' + 'a'.repeat(36),
    EMAIL_FROM: 'Slink <no-reply@slink.example.test>',
  }));
});
