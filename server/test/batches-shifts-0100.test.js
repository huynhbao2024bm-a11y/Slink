'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { openPGliteRuntime } = require('../pglite-runtime');

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

test('0.10.0: product batches FEFO deduction, expiring dashboard alert, bulk archive, and staff shifts', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-0100-'));
  const runtime = await openPGliteRuntime({
    dataDirectory: dir,
    migrationsDirectory: path.join(__dirname, '..', 'migrations'),
  });
  const app = await buildServer({ pool: runtime.pool, env: { NODE_ENV: 'test', SESSION_SECRET: '0123456789abcdef0123456789abcdef', DISABLE_CAPTCHA_FOR_TESTS: 'true', DEMO_DISABLE_EMAIL_VERIFICATION: 'true' } });
  await app.ready();
  t.after(async () => { await app.close(); await runtime.pool.end(); await fs.rm(dir, { recursive: true, force: true }); });

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: { email: `owner-${randomUUID().slice(0, 8)}@example.com`, password: 'Password123!', displayName: 'Owner Test', storeName: 'Apex Test' },
  });
  assert.equal(reg.statusCode, 201);
  const headers = makeAuthHeaders(extractCookies(reg));
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
  const meBody = JSON.parse(me.body);
  const storeId = meBody.stores[0].id;
  const userId = meBody.user.id;

  // 1. Create batch-tracked product & 2 extra products for bulk archive
  const p1Res = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers,
    payload: { name: 'Nước tăng lực Sport', sku: 'NL-01', category: 'Đồ uống', unit: 'chai', salePriceVnd: 25000, costVnd: 12000, lowStockThreshold: 5, inventoryTracked: true, batchTracked: true },
  });
  assert.equal(p1Res.statusCode, 200);
  const p1 = JSON.parse(p1Res.body).product;
  assert.equal(p1.batch_tracked, true);

  const p2Res = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers,
    payload: { name: 'Old Item 1', sku: 'OLD-1', category: 'Khác', unit: 'cái', salePriceVnd: 10000, costVnd: 5000, lowStockThreshold: 0, inventoryTracked: true },
  });
  const p3Res = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers,
    payload: { name: 'Old Item 2', sku: 'OLD-2', category: 'Khác', unit: 'cái', salePriceVnd: 10000, costVnd: 5000, lowStockThreshold: 0, inventoryTracked: true },
  });
  const p2Id = JSON.parse(p2Res.body).product.id;
  const p3Id = JSON.parse(p3Res.body).product.id;

  // Bulk archive 2 old products
  const bulkArch = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-archive`, headers,
    payload: { productIds: [p2Id, p3Id] },
  });
  assert.equal(bulkArch.statusCode, 200);
  assert.equal(JSON.parse(bulkArch.body).archivedCount, 2);

  // 2. Receive 2 batches with different expiry dates (soonest within 10 days, later in 120 days)
  const soonDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const lateDate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);

  const b1 = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/${p1.id}/batches`, headers,
    payload: { batchCode: 'LO-SOON', expiryDate: soonDate, quantity: '3' },
  });
  assert.equal(b1.statusCode, 200);

  const b2 = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/${p1.id}/batches`, headers,
    payload: { batchCode: 'LO-LATE', expiryDate: lateDate, quantity: '5' },
  });
  assert.equal(b2.statusCode, 200);

  // Dashboard should report 1 expiring batch
  const dash = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers });
  assert.equal(dash.statusCode, 200);
  assert.equal(JSON.parse(dash.body).actionItems.expiringBatchesCount, 1);

  // 3. Sell 4 units via POS (FEFO should take all 3 from LO-SOON and 1 from LO-LATE)
  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p1.id, quantity: 4, expectedUnitPriceVnd: '25000' }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: '100000' }],
    },
  });
  assert.ok([200, 201].includes(sale.statusCode));

  const batchesAfter = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/batches?productId=${p1.id}&includeEmpty=true`, headers });
  const batchList = JSON.parse(batchesAfter.body).batches;
  const soonAfter = batchList.find(b => b.batch_code === 'LO-SOON');
  const lateAfter = batchList.find(b => b.batch_code === 'LO-LATE');
  assert.equal(Number(soonAfter.quantity), 0);
  assert.equal(Number(lateAfter.quantity), 4);

  // 4. Staff shifts: assign -> list -> check-in -> check-out -> delete
  const workDate = new Date().toISOString().slice(0, 10);
  const assign = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/shifts`, headers,
    payload: { userId, workDate, shiftType: 'morning', note: 'Trực quầy' },
  });
  assert.equal(assign.statusCode, 200);
  const shiftId = JSON.parse(assign.body).shifts[0].id;

  const listShifts = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/shifts?month=${workDate.slice(0, 7)}`, headers });
  assert.equal(listShifts.statusCode, 200);
  assert.equal(JSON.parse(listShifts.body).shifts.length, 1);

  const checkIn = await app.inject({ method: 'POST', url: `/api/stores/${storeId}/shifts/${shiftId}/check-in`, headers, payload: {} });
  assert.equal(checkIn.statusCode, 200);
  assert.ok(['checked_in', 'late'].includes(JSON.parse(checkIn.body).shift.status));

  const checkOut = await app.inject({ method: 'POST', url: `/api/stores/${storeId}/shifts/${shiftId}/check-out`, headers, payload: {} });
  assert.equal(checkOut.statusCode, 200);
  assert.equal(JSON.parse(checkOut.body).shift.status, 'completed');

  const delShift = await app.inject({ method: 'DELETE', url: `/api/stores/${storeId}/shifts/${shiftId}`, headers });
  assert.equal(delShift.statusCode, 200);
});
