'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const { runLogicalRestoreDrill } = require('../../scripts/restore-drill');

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

async function testApp(t) {
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
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({ pool, logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  app.testDb = db;
  t.after(() => app.close());
  return app;
}

async function registerOwner(app, suffix) {
  const email = `prod-owner-${suffix}@example.com`;
  const password = 'correct horse battery staple 47';
  const registration = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email, displayName: 'Chủ cửa hàng', storeName: `Cửa hàng ${suffix}`, password },
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const token = new URLSearchParams(new URL(registration.json().developmentVerificationUrl).hash.slice(1)).get('token');
  const verified = await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token } });
  assert.equal(verified.statusCode, 200, verified.body);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = cookiesFrom(login);
  const storeId = login.json().stores[0].id;
  const headers = {
    cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
    origin,
    'x-csrf-token': cookies.slink_csrf,
  };
  const openShift = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...headers, 'idempotency-key': `open-shift-${suffix}-00001` },
    payload: { openingFloatVnd: 1000000, note: 'Ca kiểm thử' },
  });
  assert.equal(openShift.statusCode, 201, openShift.body);
  return { storeId, headers };
}

test('Track B: encrypted backup and restore drill verifies AES-256-GCM integrity and fresh DB recovery', async () => {
  const result = await runLogicalRestoreDrill();
  assert.equal(result.ok, true);
  assert.equal(result.restoredRows, 2);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.ok(result.rtoMs >= 0);
});

test('Track C: standalone /legal/terms, /legal/privacy, and /legal-content.js serve Vietnamese Decree 13/2023/ND-CP legal pages', async (t) => {
  const app = await testApp(t);

  const termsRes = await app.inject({ method: 'GET', url: '/legal/terms' });
  assert.equal(termsRes.statusCode, 200);
  assert.match(termsRes.headers['content-type'], /text\/html/);
  assert.match(termsRes.body, /Điều khoản sử dụng/i);

  const privacyRes = await app.inject({ method: 'GET', url: '/legal/privacy' });
  assert.equal(privacyRes.statusCode, 200);
  assert.match(privacyRes.headers['content-type'], /text\/html/);
  assert.match(privacyRes.body, /13\/2023\/NĐ-CP/);

  const assetRes = await app.inject({ method: 'GET', url: '/legal-content.js' });
  assert.equal(assetRes.statusCode, 200);
  assert.match(assetRes.headers['content-type'], /javascript/);
});

async function createSerialProduct(app, storeId, headers, { sku, name, salePriceVnd, costVnd, serialCodes }) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': `create-ser-${sku}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    payload: {
      items: [{
        sku,
        barcode: null,
        name,
        category: 'Hàng hóa',
        unit: 'cái',
        salePriceVnd,
        costVnd,
        lowStockThreshold: '1',
        inventoryTracked: true,
        serialTracked: true,
        openingQuantity: String(serialCodes.length),
        serialCodes,
      }],
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().products[0].id;
}

test('Track E: exact serial selection on partial return restocks only returned code and keeps remaining code sold', async (t) => {
  const app = await testApp(t);
  const { storeId, headers } = await registerOwner(app, 'exact-return');

  const productId = await createSerialProduct(app, storeId, headers, {
    sku: 'ENG-B1',
    name: 'Sách Tiếng Anh B1',
    salePriceVnd: 120000,
    costVnd: 80000,
    serialCodes: ['RET-S1', 'RET-S2'],
  });

  const saleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'sale-exact-return-key-0001' },
    payload: {
      items: [{ productId, quantity: 2, serialCodes: ['RET-S1', 'RET-S2'] }],
      method: 'cash',
      amountReceivedVnd: 240000,
    },
  });
  assert.equal(saleRes.statusCode, 201, saleRes.body);
  const orderId = saleRes.json().order.id;

  const detailRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(detailRes.statusCode, 200, detailRes.body);
  const orderLine = detailRes.json().order.items[0];
  assert.deepEqual(orderLine.sold_serial_codes, ['RET-S1', 'RET-S2']);

  // Partial return ONLY RET-S1
  const returnRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: { ...headers, 'idempotency-key': 'ret-exact-serial-key-0001' },
    payload: {
      items: [{ orderLineId: orderLine.id, quantity: 1, serialCodes: ['RET-S1'] }],
      reason: 'Khách đổi 1 cuốn',
      restockPolicy: 'restock',
      refundMethod: 'cash',
    },
  });
  assert.equal(returnRes.statusCode, 201, returnRes.body);

  // RET-S1 cannot be returned a second time
  const dupReturnRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: { ...headers, 'idempotency-key': 'ret-exact-serial-key-0002' },
    payload: {
      items: [{ orderLineId: orderLine.id, quantity: 1, serialCodes: ['RET-S1'] }],
      reason: 'Thử trả lại mã đã trả',
      restockPolicy: 'restock',
      refundMethod: 'cash',
    },
  });
  assert.equal(dupReturnRes.statusCode, 409, dupReturnRes.body);
  assert.equal(dupReturnRes.json().error.code, 'serial_return_invalid');

  // RET-S2 is still SOLD and blocked from resale
  const resellS2 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'sale-resell-s2-blocked-001' },
    payload: {
      items: [{ productId, quantity: 1, serialCodes: ['RET-S2'] }],
      method: 'cash',
      amountReceivedVnd: 120000,
    },
  });
  assert.equal(resellS2.statusCode, 409, resellS2.body);
  assert.equal(resellS2.json().error.code, 'serial_already_sold');

  // RET-S1 is back in_stock and sellable again
  const resellS1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'sale-resell-s1-allowed-001' },
    payload: {
      items: [{ productId, quantity: 1, serialCodes: ['RET-S1'] }],
      method: 'cash',
      amountReceivedVnd: 120000,
    },
  });
  assert.equal(resellS1.statusCode, 201, resellS1.body);
});

test('Track E: atomic serial warehouse transfer moves codes and inventory balances cleanly', async (t) => {
  const app = await testApp(t);
  const { storeId, headers } = await registerOwner(app, 'serial-transfer');

  const whListRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers });
  assert.equal(whListRes.statusCode, 200, whListRes.body);
  const whA = whListRes.json().warehouses[0];

  const whBRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'create-warehouse-cn2-0001' },
    payload: { code: 'CN2', name: 'Kho Chi Nhánh 2' },
  });
  assert.equal(whBRes.statusCode, 201, whBRes.body);
  const whB = whBRes.json().warehouse;

  const productId = await createSerialProduct(app, storeId, headers, {
    sku: 'BT-PRO',
    name: 'Tai nghe Bluetooth Pro',
    salePriceVnd: 500000,
    costVnd: 300000,
    serialCodes: ['TRF-01', 'TRF-02'],
  });

  // Transfer TRF-01 from A -> B
  const trfRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/serials/transfer`,
    headers: { ...headers, 'idempotency-key': 'serial-transfer-key-0001' },
    payload: {
      productId,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whB.id,
      codes: ['TRF-01'],
      note: 'Điều chuyển chi nhánh 2',
    },
  });
  assert.equal(trfRes.statusCode, 201, trfRes.body);
  assert.equal(trfRes.json().transferredCount, 1);
  assert.equal(Number(trfRes.json().sourceOnHand), 1);
  assert.equal(Number(trfRes.json().destinationOnHand), 1);

  // Idempotent replay
  const replayRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/serials/transfer`,
    headers: { ...headers, 'idempotency-key': 'serial-transfer-key-0001' },
    payload: {
      productId,
      sourceWarehouseId: whA.id,
      destinationWarehouseId: whB.id,
      codes: ['TRF-01'],
      note: 'Điều chuyển chi nhánh 2',
    },
  });
  assert.equal(replayRes.statusCode, 201, replayRes.body);
  assert.equal(replayRes.headers['idempotent-replayed'], 'true');

  // Selling TRF-01 from Warehouse A fails (it is now in Warehouse B)
  const sellWrongWh = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'sell-trf01-wrong-wh-0001' },
    payload: {
      warehouseId: whA.id,
      items: [{ productId, quantity: 1, serialCodes: ['TRF-01'] }],
      method: 'cash',
      amountReceivedVnd: 500000,
    },
  });
  assert.equal(sellWrongWh.statusCode, 409, sellWrongWh.body);

  // Selling TRF-01 from Warehouse B succeeds
  const sellRightWh = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'sell-trf01-right-wh-0001' },
    payload: {
      warehouseId: whB.id,
      items: [{ productId, quantity: 1, serialCodes: ['TRF-01'] }],
      method: 'cash',
      amountReceivedVnd: 500000,
    },
  });
  assert.equal(sellRightWh.statusCode, 201, sellRightWh.body);
});

test('Track E: 10-way concurrent POS checkout race on same serial code allows exactly 1 sale and blocks 9', async (t) => {
  const app = await testApp(t);
  const { storeId, headers } = await registerOwner(app, 'race-serial');

  const productId = await createSerialProduct(app, storeId, headers, {
    sku: 'LIM-01',
    name: 'Điện thoại Limited',
    salePriceVnd: 9000000,
    costVnd: 7000000,
    serialCodes: ['RACE-01'],
  });

  const attempts = Array.from({ length: 10 }, (_, idx) => app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': `race-checkout-attempt-${String(idx).padStart(4, '0')}` },
    payload: {
      items: [{ productId, quantity: 1, serialCodes: ['RACE-01'] }],
      method: 'cash',
      amountReceivedVnd: 9000000,
    },
  }));

  const responses = await Promise.all(attempts);
  const succeeded = responses.filter((r) => r.statusCode === 201);
  const blocked = responses.filter((r) => r.statusCode === 409);
  assert.equal(succeeded.length, 1, `Expected exact 1 succeeded sale, got ${succeeded.length}`);
  assert.equal(blocked.length, 9, `Expected exact 9 blocked sales, got ${blocked.length}`);

  const serialsRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${productId}/serials?status=all`,
    headers,
  });
  assert.equal(serialsRes.statusCode, 200, serialsRes.body);
  assert.equal(serialsRes.json().counts.inStock, 0);
  assert.equal(serialsRes.json().counts.sold, 1);
});
