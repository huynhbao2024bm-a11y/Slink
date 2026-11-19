'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const barcodeTools = require('../../barcode-tools');

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
  const email = `serial-owner-${suffix}@example.com`;
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
  return {
    store: login.json().stores[0],
    headers: {
      cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
      origin,
      'x-csrf-token': cookies.slink_csrf,
    },
  };
}

test('serial-tracked product prevents reselling sold barcodes, supports non-numeric/QR codes, and restores on return/void', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'lifecycle');
  const storeId = owner.store.id;

  // Open a cash session so cash sales & cash refunds execute cleanly
  const openShift = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-open-shift-0001' },
    payload: { openingFloatVnd: 500000, note: 'Ca bán sách' },
  });
  assert.equal(openShift.statusCode, 201, openShift.body);

  // 1. Create a serial-tracked product ("Sách Tiếng Anh") via import with non-numeric & QR codes
  const importRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-import-book-0001' },
    payload: {
      items: [{
        sku: 'SACH-TA',
        barcode: null,
        name: 'Sách Tiếng Anh',
        category: 'Sách',
        unit: 'cuốn',
        salePriceVnd: 120000,
        costVnd: 70000,
        lowStockThreshold: '2',
        inventoryTracked: true,
        serialTracked: true,
        openingQuantity: '3',
        serialCodes: ['SACH-TA-01', 'QR/BOOK-02', 'SÁCH-VN-03'],
      }],
    },
  });
  assert.equal(importRes.statusCode, 201, importRes.body);
  const book = importRes.json().products[0];
  assert.equal(book.serial_tracked, true);
  assert.equal(Number(book.on_hand), 3);

  // 2. Add more individual units to the SAME product (scanned non-numeric + auto-generated) without recreating product
  const addUnitsRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/${book.id}/serials`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-add-units-0001' },
    payload: {
      codes: ['BOOK/ALPHA-04'],
      autoGenerateCount: 2,
      prefix: 'ENG',
      note: 'Nhập thêm lô sách mới',
    },
  });
  assert.equal(addUnitsRes.statusCode, 201, addUnitsRes.body);
  assert.equal(addUnitsRes.json().addedCount, 3);
  assert.equal(Number(addUnitsRes.json().newOnHand), 6);

  // Safe idempotency replay returns same result without duplicating stock
  const replayAdd = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/${book.id}/serials`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-add-units-0001' },
    payload: {
      codes: ['BOOK/ALPHA-04'],
      autoGenerateCount: 2,
      prefix: 'ENG',
      note: 'Nhập thêm lô sách mới',
    },
  });
  assert.equal(replayAdd.statusCode, 201);
  assert.equal(replayAdd.headers['idempotent-replayed'], 'true');

  // Duplicate serial code across store (case-insensitive) is rejected with 409
  const dupRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/${book.id}/serials`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-add-dup-0001' },
    payload: { codes: ['sach-ta-01'] },
  });
  assert.equal(dupRes.statusCode, 409, dupRes.body);
  assert.equal(dupRes.json().error.code, 'serial_code_exists');

  // 3. Lookup serial code case-insensitively
  const lookup1 = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/serials/lookup?code=${encodeURIComponent('sach-ta-01')}`,
    headers: owner.headers,
  });
  assert.equal(lookup1.statusCode, 200, lookup1.body);
  assert.equal(lookup1.json().matchType, 'serial');
  assert.equal(lookup1.json().serial.code, 'SACH-TA-01');
  assert.equal(lookup1.json().serial.status, 'in_stock');

  // 4. Sell SACH-TA-01 -> 201
  const sale1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-sale-first-0001' },
    payload: {
      items: [{ productId: book.id, quantity: 1, serialCodes: ['SACH-TA-01'] }],
      method: 'cash',
      amountReceivedVnd: 120000,
    },
  });
  assert.equal(sale1.statusCode, 201, sale1.body);
  const order1 = sale1.json().order;
  assert.deepEqual(order1.items[0].serialCodes, ['SACH-TA-01']);

  // Lookup now reports status = 'sold' with orderNumber!
  const lookupSold = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/serials/lookup?code=${encodeURIComponent('SACH-TA-01')}`,
    headers: owner.headers,
  });
  assert.equal(lookupSold.statusCode, 200);
  assert.equal(lookupSold.json().serial.status, 'sold');
  assert.equal(lookupSold.json().serial.orderNumber, order1.number);

  // 5. Attempting to resell SACH-TA-01 MUST BE BLOCKED with 409 serial_already_sold!
  const resellBlocked = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-sale-resell-0001' },
    payload: {
      items: [{ productId: book.id, quantity: 1, serialCodes: ['SACH-TA-01'] }],
      method: 'cash',
      amountReceivedVnd: 120000,
    },
  });
  assert.equal(resellBlocked.statusCode, 409, resellBlocked.body);
  assert.equal(resellBlocked.json().error.code, 'serial_already_sold');

  // 6. Selling a DIFFERENT unit (QR/BOOK-02) of the same product SUCCEEDS!
  const sale2 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-sale-second-0001' },
    payload: {
      items: [{ productId: book.id, quantity: 1, serialCodes: ['QR/BOOK-02'] }],
      method: 'bank_transfer',
      amountReceivedVnd: 120000,
    },
  });
  assert.equal(sale2.statusCode, 201, sale2.body);

  // List serials shows 4 in_stock and 2 sold
  const listRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${book.id}/serials`,
    headers: owner.headers,
  });
  assert.equal(listRes.statusCode, 200, listRes.body);
  assert.deepEqual(listRes.json().counts, { inStock: 4, sold: 2 });

  // 7. Returning order1 with restock restores SACH-TA-01 back to in_stock!
  const orderDetail = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/orders/${order1.id}`,
    headers: owner.headers,
  });
  const orderLineId = orderDetail.json().order.items[0].id;
  const returnRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${order1.id}/returns`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-return-restock-0001' },
    payload: {
      reason: 'Khách đổi sách',
      refundMethod: 'cash',
      refundAmountVnd: 120000,
      items: [{ orderLineId, quantity: 1, restock: true }],
    },
  });
  assert.equal(returnRes.statusCode, 201, returnRes.body);

  const lookupRestored = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/serials/lookup?code=${encodeURIComponent('SACH-TA-01')}`,
    headers: owner.headers,
  });
  assert.equal(lookupRestored.json().serial.status, 'in_stock');

  // 8. Reselling restored SACH-TA-01 now works again, and voiding an unpaid order restores its serial too
  const customerRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/customers`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-cust-0001' },
    payload: { name: 'Khách Nợ Sách', phone: '0912345678', openingBalanceVnd: '0' },
  });
  const customerId = customerRes.json().customer.id;
  const unpaidSale = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-sale-unpaid-0001' },
    payload: {
      items: [{ productId: book.id, quantity: 1, serialCodes: ['SACH-TA-01'] }],
      customerId,
      method: 'cash',
      amountReceivedVnd: 0,
    },
  });
  assert.equal(unpaidSale.statusCode, 201, unpaidSale.body);
  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${unpaidSale.json().order.id}/void`,
    headers: { ...owner.headers, 'idempotency-key': 'serial-void-0001' },
    payload: { reason: 'Hủy đơn nhầm', stockConfirmed: true },
  });
  assert.equal(voidRes.statusCode, 200, voidRes.body);

  const lookupAfterVoid = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/serials/lookup?code=${encodeURIComponent('SACH-TA-01')}`,
    headers: owner.headers,
  });
  assert.equal(lookupAfterVoid.json().serial.status, 'in_stock');
});

test('serial codes enforce RBAC and cross-store tenant isolation, and barcode-tools supports non-numeric & QR rendering', async (t) => {
  const app = await testApp(t);
  const storeA = await registerOwner(app, 'tenant-a');
  const storeB = await registerOwner(app, 'tenant-b');

  // Store A creates a serial-tracked product
  const created = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeA.store.id}/products`,
    headers: storeA.headers,
    payload: {
      sku: 'QR-BOOK-A',
      name: 'Sách Store A',
      category: 'Sách',
      unit: 'cuốn',
      salePriceVnd: 90000,
      costVnd: 50000,
      lowStockThreshold: '1',
      inventoryTracked: true,
      serialTracked: true,
    },
  });
  assert.equal(created.statusCode, 200, created.body);
  const productA = created.json().product;
  assert.equal(productA.serial_tracked, true);

  const added = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeA.store.id}/products/${productA.id}/serials`,
    headers: { ...storeA.headers, 'idempotency-key': 'tenant-a-add-serial-0001' },
    payload: { codes: ['PRIVATE-A-001'] },
  });
  assert.equal(added.statusCode, 201, added.body);

  // Store B cannot see Store A's serial code via lookup
  const crossLookup = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeB.store.id}/serials/lookup?code=${encodeURIComponent('PRIVATE-A-001')}`,
    headers: storeB.headers,
  });
  assert.equal(crossLookup.statusCode, 200);
  assert.equal(crossLookup.json().matchType, 'none');

  // Store B cannot access Store A's serial endpoint (403)
  const crossAccess = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeA.store.id}/products/${productA.id}/serials`,
    headers: storeB.headers,
  });
  assert.equal(crossAccess.statusCode, 403);

  // Barcode tools renders Code 128 SVG for ASCII non-numeric AND QR SVG fallback for Vietnamese/long codes
  const asciiSvg = barcodeTools.renderBarcodeSvg('BOOK-ENG-01');
  assert.match(asciiSvg, /class='barcode-svg'/);
  assert.match(asciiSvg, /BOOK-ENG-01/);
  const vietQrSvg = barcodeTools.renderBarcodeSvg('SÁCH-VN-03');
  assert.match(vietQrSvg, /barcode-qr-svg/);
  assert.match(vietQrSvg, /SÁCH-VN-03/);
});
