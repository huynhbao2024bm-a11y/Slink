'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const {
  OWNER_FULL_PERMISSIONS,
  ROLE_DEFAULTS,
  resolveEffectivePermissions,
  validatePermissionsInput,
} = require('../rbac');
const { computeWarrantyStatus } = require('../serials');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : [response.headers['set-cookie']];
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
}

function authHeaders(cookies) {
  return {
    cookie: cookieHeader(cookies),
    origin,
    'x-csrf-token': cookies.slink_csrf,
  };
}

async function testApp(t) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) {
    await db.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'));
  }
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.promotions, public.promotion_redemptions FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.promotions TO slink_app;
    GRANT SELECT, INSERT ON public.promotion_redemptions TO slink_app;
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    REVOKE ALL ON public.product_sale_price_history FROM slink_app;
    GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
    REVOKE ALL ON public.sales_channel_profiles, public.channel_product_mappings FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.sales_channel_profiles, public.channel_product_mappings TO slink_app;
    REVOKE ALL ON public.channel_orders, public.channel_order_lines, public.channel_order_events FROM slink_app;
    GRANT SELECT, INSERT ON public.channel_orders, public.channel_order_lines, public.channel_order_events TO slink_app;
    GRANT UPDATE (fulfillment_status, version, updated_by, updated_at, packed_at, shipped_at, delivered_at, cancelled_at) ON public.channel_orders TO slink_app;
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
  const email = `m1-owner-${suffix}@example.com`;
  const password = 'correct horse battery staple 47';
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email, displayName: `Chủ shop ${suffix}`, storeName: `Shop ${suffix}`, password },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  const token = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  const verify = await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token } });
  assert.equal(verify.statusCode, 200, verify.body);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = cookiesFrom(login);
  return {
    user: login.json().user,
    store: login.json().stores[0],
    headers: authHeaders(cookies),
  };
}

async function directCreateAndLogin(app, { storeId, ownerHeaders, email, role, displayName, permissions, warehouseScopeMode, warehouseIds }) {
  const password = 'staff-password-for-test-47';
  const createRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/direct-create`,
    headers: ownerHeaders,
    payload: {
      email,
      role,
      displayName: displayName || `Nhân viên ${role}`,
      password,
      ...(permissions !== undefined ? { permissions } : {}),
      ...(warehouseScopeMode !== undefined ? { warehouseScopeMode } : {}),
      ...(warehouseIds !== undefined ? { warehouseIds } : {}),
    },
  });
  assert.equal(createRes.statusCode, 201, createRes.body);
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin },
    payload: { email, password },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = cookiesFrom(login);
  return {
    created: createRes.json().member,
    user: login.json().user,
    store: login.json().stores.find((s) => s.id === storeId),
    headers: authHeaders(cookies),
  };
}

test('M1 unit invariants: RBAC permission resolution/validation and computeWarrantyStatus', () => {
  assert.deepEqual(resolveEffectivePermissions('owner', { view_cost_price: false, pos_max_discount_pct: 0 }), OWNER_FULL_PERMISSIONS);
  assert.deepEqual(resolveEffectivePermissions('cashier', {}), ROLE_DEFAULTS.cashier);
  assert.deepEqual(resolveEffectivePermissions('cashier', { view_cost_price: true, pos_max_discount_pct: 15 }), {
    ...ROLE_DEFAULTS.cashier,
    view_cost_price: true,
    pos_max_discount_pct: 15,
  });

  assert.throws(() => validatePermissionsInput(null), /không hợp lệ/);
  assert.throws(() => validatePermissionsInput([]), /không hợp lệ/);
  assert.throws(() => validatePermissionsInput({ unknown_key: true }), /không được hỗ trợ/);
  assert.throws(() => validatePermissionsInput({ pos_max_discount_pct: -1 }), /0 đến 100/);
  assert.throws(() => validatePermissionsInput({ pos_max_discount_pct: 101 }), /0 đến 100/);
  assert.throws(() => validatePermissionsInput({ pos_max_discount_pct: 10.5 }), /0 đến 100/);
  assert.throws(() => validatePermissionsInput({ pos_max_discount_pct: '10' }), /0 đến 100/);
  assert.throws(() => validatePermissionsInput({ view_cost_price: 1 }), /boolean/);

  const now = Date.UTC(2026, 10, 21, 10, 0, 0);
  assert.equal(computeWarrantyStatus({ status: 'in_stock', warranty_expires_at: new Date(now + 10000) }, now), 'in_stock');
  assert.equal(computeWarrantyStatus({ status: 'archived', warranty_expires_at: new Date(now + 10000) }, now), 'archived');
  assert.equal(computeWarrantyStatus({ status: 'sold', warranty_expires_at: null }, now), 'none');
  assert.equal(computeWarrantyStatus({ status: 'sold', warranty_expires_at: new Date(now + 86400_000) }, now), 'active');
  assert.equal(computeWarrantyStatus({ status: 'sold', warranty_expires_at: new Date(now - 1000) }, now), 'expired');
});

test('M1 Đợt 2 Suite 1: serial warranty lifecycle (stamp on sale, lookup, expired, return restock/archive, void, cross-store isolation)', async (t) => {
  const app = await testApp(t);
  const ownerA = await registerOwner(app, 'warranty-a');
  const ownerB = await registerOwner(app, 'warranty-b');
  const storeA = ownerA.store.id;

  const openShift = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/cash-register/open`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-open-shift-0001' },
    payload: { openingFloatVnd: 200000 },
  });
  assert.equal(openShift.statusCode, 201, openShift.body);

  // Reject invalid warrantyMonths values
  for (const badWarranty of [-1, 1201, 12.5, 'abc']) {
    const badRes = await app.inject({
      method: 'POST', url: `/api/stores/${storeA}/products`,
      headers: ownerA.headers,
      payload: { sku: 'BAD-W', name: 'Bad', salePriceVnd: 10000, warrantyMonths: badWarranty },
    });
    assert.equal(badRes.statusCode, 400, `Expected 400 for warrantyMonths=${badWarranty}: ${badRes.body}`);
  }

  // Create serial-tracked product with 12-month warranty via POST /products
  const phoneRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/products`,
    headers: ownerA.headers,
    payload: {
      sku: 'IPHONE-16',
      name: 'iPhone 16 Pro',
      category: 'Điện thoại',
      unit: 'máy',
      salePriceVnd: 25000000,
      costVnd: 20000000,
      serialTracked: true,
      inventoryTracked: true,
      warrantyMonths: 12,
    },
  });
  assert.equal(phoneRes.statusCode, 200, phoneRes.body);
  const phone = phoneRes.json().product;
  assert.equal(phone.warranty_months, 12);

  // Add 3 serials
  const addSerials = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/products/${phone.id}/serials`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-add-serials-01' },
    payload: { codes: ['IMEI-001', 'IMEI-002', 'IMEI-003'] },
  });
  assert.equal(addSerials.statusCode, 201, addSerials.body);

  // Import a second serial-tracked product with warrantyMonths: 0
  const importRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/products/import`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-import-zero-01' },
    payload: {
      items: [{
        sku: 'CABLE-0M',
        name: 'Cáp sạc không bảo hành',
        category: 'Phụ kiện',
        unit: 'cái',
        salePriceVnd: 150000,
        costVnd: 50000,
        serialTracked: true,
        warrantyMonths: 0,
        serialCodes: ['CAB-001'],
      }],
    },
  });
  assert.equal(importRes.statusCode, 201, importRes.body);
  const cable = importRes.json().products[0];
  assert.equal(cable.warranty_months, 0);

  // Create customer
  const custRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/customers`,
    headers: ownerA.headers,
    payload: { name: 'Nguyễn Văn Bảo', phone: '0909123456' },
  });
  assert.equal(custRes.statusCode, 201, custRes.body);
  const customer = custRes.json().customer;

  // Paid sale of IMEI-001, IMEI-002 (12m) and CAB-001 (0m)
  const saleRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/sales`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-sale-paid-0001' },
    payload: {
      customerId: customer.id,
      items: [
        { productId: phone.id, quantity: 2, serialCodes: ['IMEI-001', 'IMEI-002'] },
        { productId: cable.id, quantity: 1, serialCodes: ['CAB-001'] },
      ],
      tenders: [{ method: 'cash', amountReceivedVnd: 50150000 }],
    },
  });
  assert.equal(saleRes.statusCode, 201, saleRes.body);
  const order = saleRes.json().order;
  assert.equal(order.items[0].warrantyMonths, 12);
  assert.equal(order.items[0].serialWarranties.length, 2);
  assert.ok(order.items[0].serialWarranties[0].warrantyExpiresAt);
  assert.equal(order.items[1].warrantyMonths, 0);
  assert.equal(order.items[1].serialWarranties[0].warrantyExpiresAt, null);

  // Lookup IMEI-001 -> active warranty + customer info
  const lookup1 = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/serials/lookup?code=IMEI-001`,
    headers: ownerA.headers,
  });
  assert.equal(lookup1.statusCode, 200, lookup1.body);
  const s1 = lookup1.json().serial;
  assert.equal(s1.warrantyMonths, 12);
  assert.equal(s1.warrantyStatus, 'active');
  assert.ok(s1.warrantyExpiresAt);
  assert.equal(s1.customerName, 'Nguyễn Văn Bảo');
  assert.equal(s1.customerPhone, '0909123456');
  assert.equal(s1.orderNumber, order.number);
  assert.ok(s1.soldAt);
  assert.ok(new Date(s1.warrantyExpiresAt).getTime() > new Date(s1.soldAt).getTime() + 300 * 86400_000);

  // Lookup CAB-001 -> warrantyStatus 'none'
  const lookupCab = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/serials/lookup?code=CAB-001`,
    headers: ownerA.headers,
  });
  assert.equal(lookupCab.statusCode, 200, lookupCab.body);
  assert.equal(lookupCab.json().serial.warrantyStatus, 'none');
  assert.equal(lookupCab.json().serial.warrantyExpiresAt, null);

  // Product serials list preserves snake_case AND adds warranty/customer fields
  const listRes = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/products/${phone.id}/serials`,
    headers: ownerA.headers,
  });
  assert.equal(listRes.statusCode, 200, listRes.body);
  const listedImei1 = listRes.json().serials.find((r) => r.code === 'IMEI-001');
  assert.equal(listedImei1.warrantyStatus, 'active');
  assert.equal(listedImei1.warrantyMonths, 12);
  assert.equal(listedImei1.customerName, 'Nguyễn Văn Bảo');
  assert.equal(listedImei1.order_number, order.number);
  assert.ok(listedImei1.warehouse_name);

  // Backdate IMEI-002 warranty_expires_at in PGlite -> expired
  await app.testDb.query(
    `UPDATE product_serial_codes SET warranty_expires_at = now() - interval '1 day' WHERE code = 'IMEI-002'`
  );
  const lookupExpired = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/serials/lookup?code=IMEI-002`,
    headers: ownerA.headers,
  });
  assert.equal(lookupExpired.json().serial.warrantyStatus, 'expired');

  // Cross-store isolation: Store B cannot see Store A serial
  const crossStore = await app.inject({
    method: 'GET', url: `/api/stores/${ownerB.store.id}/serials/lookup?code=IMEI-001`,
    headers: ownerB.headers,
  });
  assert.equal(crossStore.statusCode, 200);
  assert.equal(crossStore.json().matchType, 'none');

  // Fetch order detail to get order_line_id for returns
  const orderDetail = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/orders/${order.id}`,
    headers: ownerA.headers,
  });
  const phoneLineId = orderDetail.json().order.items.find((i) => i.product_id === phone.id).id;

  // Return IMEI-001 (restock) -> clears warranty_expires_at & status='in_stock'
  const retRestock = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/orders/${order.id}/returns`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-ret-restock-0001' },
    payload: {
      reason: 'Khách đổi ý',
      restockPolicy: 'restock',
      refundMethod: 'cash',
      items: [{ orderLineId: phoneLineId, quantity: 1, serialCodes: ['IMEI-001'] }],
    },
  });
  assert.equal(retRestock.statusCode, 201, retRestock.body);
  const lookupRestocked = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/serials/lookup?code=IMEI-001`,
    headers: ownerA.headers,
  });
  assert.equal(lookupRestocked.json().serial.status, 'in_stock');
  assert.equal(lookupRestocked.json().serial.warrantyStatus, 'in_stock');
  assert.equal(lookupRestocked.json().serial.warrantyExpiresAt, null);
  assert.equal(lookupRestocked.json().serial.customerName, null);

  // Return IMEI-002 (damaged -> archived) -> clears warranty_expires_at & warrantyStatus='archived'
  const retDamaged = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/orders/${order.id}/returns`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-ret-damaged-0001' },
    payload: {
      reason: 'Hư hỏng',
      restockPolicy: 'damaged',
      refundMethod: 'cash',
      items: [{ orderLineId: phoneLineId, quantity: 1, serialCodes: ['IMEI-002'] }],
    },
  });
  assert.equal(retDamaged.statusCode, 201, retDamaged.body);
  const dbDamaged = await app.testDb.query(`SELECT status, warranty_expires_at FROM product_serial_codes WHERE code = 'IMEI-002'`);
  assert.equal(dbDamaged.rows[0].status, 'archived');
  assert.equal(dbDamaged.rows[0].warranty_expires_at, null);
  const lookupArchived = await app.inject({
    method: 'GET', url: `/api/stores/${storeA}/serials/lookup?code=IMEI-002`,
    headers: ownerA.headers,
  });
  assert.equal(lookupArchived.json().serial.warrantyStatus, 'archived');

  // Unpaid order void clears warranty_expires_at
  const unpaidSale = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/sales`,
    headers: { ...ownerA.headers, 'idempotency-key': 'm1-warr-sale-unpaid-001' },
    payload: {
      customerId: customer.id,
      items: [{ productId: phone.id, quantity: 1, serialCodes: ['IMEI-003'] }],
      tenders: [],
    },
  });
  assert.equal(unpaidSale.statusCode, 201, unpaidSale.body);
  const voidRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeA}/orders/${unpaidSale.json().order.id}/void`,
    headers: ownerA.headers,
    payload: { reason: 'Nhập nhầm đơn', stockConfirmed: true },
  });
  assert.equal(voidRes.statusCode, 200, voidRes.body);
  const dbVoided = await app.testDb.query(`SELECT status, warranty_expires_at FROM product_serial_codes WHERE code = 'IMEI-003'`);
  assert.equal(dbVoided.rows[0].status, 'in_stock');
  assert.equal(dbVoided.rows[0].warranty_expires_at, null);
});

test('M1 Đợt 2 Suite 2: Granular RBAC overrides, owner lock, BigInt pos_max_discount_pct cap, view_cost_price masking (API + CSV), and all boolean switches', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'rbac');
  const storeId = owner.store.id;

  // Owner always has full effectivePermissions on /api/auth/me and /api/stores
  const meOwner = await app.inject({ method: 'GET', url: '/api/auth/me', headers: owner.headers });
  assert.equal(meOwner.statusCode, 200);
  assert.deepEqual(meOwner.json().stores[0].effectivePermissions, OWNER_FULL_PERMISSIONS);

  // Open shift
  const shiftRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-rbac-open-shift-0001' },
    payload: { openingFloatVnd: 1000000 },
  });
  assert.equal(shiftRes.statusCode, 201, shiftRes.body);

  // Create staff members
  const cashier = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers,
    email: 'rbac-cashier@example.com', role: 'cashier',
    permissions: { pos_max_discount_pct: 5 },
  });
  assert.deepEqual(cashier.store.permissions, { pos_max_discount_pct: 5 });
  assert.deepEqual(cashier.store.effectivePermissions, {
    ...ROLE_DEFAULTS.cashier,
    pos_max_discount_pct: 5,
  });

  const manager = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers,
    email: 'rbac-manager@example.com', role: 'manager',
  });
  const accountant = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers,
    email: 'rbac-accountant@example.com', role: 'accountant',
  });
  const stockkeeper = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers,
    email: 'rbac-stock@example.com', role: 'stockkeeper',
  });

  // Invalid permission payloads rejected with 400
  const badDirect = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/staff/direct-create`,
    headers: owner.headers,
    payload: {
      email: 'bad-perm@example.com', role: 'cashier', displayName: 'Bad Perm',
      password: 'staff-password-for-test-47',
      permissions: { pos_max_discount_pct: 105 },
    },
  });
  assert.equal(badDirect.statusCode, 400);

  const badPatch = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { fake_perm: true } },
  });
  assert.equal(badPatch.statusCode, 400);

  // Owner cannot be self-modified (409) or role-escalated (400)
  const selfEdit = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${owner.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { view_cost_price: false } },
  });
  assert.equal(selfEdit.statusCode, 409);

  // Staff list returns roleDefaults, permissions, effectivePermissions
  const staffRes = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/staff`,
    headers: owner.headers,
  });
  assert.equal(staffRes.statusCode, 200);
  assert.deepEqual(staffRes.json().roleDefaults, ROLE_DEFAULTS);
  const staffCashier = staffRes.json().members.find((m) => m.user_id === cashier.user.id);
  assert.deepEqual(staffCashier.permissions, { pos_max_discount_pct: 5 });
  assert.equal(staffCashier.effectivePermissions.pos_max_discount_pct, 5);

  // Create products (one normal 100k VND, one serial-tracked, one huge BigInt price)
  const prodRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: owner.headers,
    payload: { sku: 'RBAC-100K', name: 'Áo 100k', salePriceVnd: 100000, costVnd: 60000, serialTracked: true, warrantyMonths: 6 },
  });
  assert.equal(prodRes.statusCode, 200, prodRes.body);
  const prod = prodRes.json().product;

  await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/${prod.id}/serials`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-rbac-add-serials-01' },
    payload: { codes: ['RBAC-S1', 'RBAC-S2', 'RBAC-S3', 'RBAC-S4', 'RBAC-S5', 'RBAC-S6'] },
  });

  const bigProdRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: owner.headers,
    payload: { sku: 'RBAC-BIG', name: 'Hàng giá trị lớn', salePriceVnd: 1000000000000000, costVnd: 800000000000000, inventoryTracked: false },
  });
  assert.equal(bigProdRes.statusCode, 200, bigProdRes.body);
  const bigProd = bigProdRes.json().product;

  // Create promotion code for testing discount cap vs promotion
  const promoRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/promotions`,
    headers: owner.headers,
    payload: { code: 'SHOP10K', name: 'Giảm shop 10k', discountType: 'fixed', discountVnd: 10000 },
  });
  assert.equal(promoRes.statusCode, 201, promoRes.body);

  // 1. pos_max_discount_pct = 5% on 100,000 VND
  const overCapSale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-sale-overcap-01' },
    payload: {
      items: [{ productId: prod.id, quantity: 1, serialCodes: ['RBAC-S1'] }],
      discountVnd: 5001,
      tenders: [{ method: 'cash', amountReceivedVnd: 94999 }],
    },
  });
  assert.equal(overCapSale.statusCode, 403, overCapSale.body);
  assert.equal(overCapSale.json().error.code, 'discount_limit_exceeded');

  // Offline sale also blocked on discount_limit_exceeded
  const overCapOffline = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-off-overcap-01' },
    payload: {
      items: [{ productId: bigProd.id, quantity: 1, expectedUnitPriceVnd: '1000000000000000' }],
      discountVnd: '50000000000001',
      totalVnd: '949999999999999',
      tenders: [{ method: 'cash', amountReceivedVnd: '949999999999999' }],
      offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: shiftRes.json().session.id },
    },
  });
  assert.equal(overCapOffline.statusCode, 403, overCapOffline.body);
  assert.equal(overCapOffline.json().error.code, 'discount_limit_exceeded');

  // Exact 5% (5000) succeeds AND BigInt exact 5% on 10^15 VND succeeds
  const atCapSale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-sale-atcap-001' },
    payload: {
      items: [{ productId: prod.id, quantity: 1, serialCodes: ['RBAC-S1'] }],
      discountVnd: 5000,
      tenders: [{ method: 'cash', amountReceivedVnd: 95000 }],
    },
  });
  assert.equal(atCapSale.statusCode, 201, atCapSale.body);

  const bigAtCap = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-sale-bigcap-01' },
    payload: {
      items: [{ productId: bigProd.id, quantity: 1 }],
      discountVnd: '50000000000000',
      tenders: [{ method: 'bank_qr', amountReceivedVnd: '950000000000000' }],
    },
  });
  assert.equal(bigAtCap.statusCode, 201, bigAtCap.body);

  // Set cashier pos_max_discount_pct = 0 -> blocks 1 VND manual discount, allows 0 + store promotionCode
  const setZeroCap = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { pos_max_discount_pct: 0 } },
  });
  assert.equal(setZeroCap.statusCode, 200, setZeroCap.body);

  const oneVndDisc = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-sale-1vnd-0001' },
    payload: {
      items: [{ productId: prod.id, quantity: 1, serialCodes: ['RBAC-S2'] }],
      discountVnd: 1,
      tenders: [{ method: 'cash', amountReceivedVnd: 99999 }],
    },
  });
  assert.equal(oneVndDisc.statusCode, 403);
  assert.equal(oneVndDisc.json().error.code, 'discount_limit_exceeded');

  const promoOnlySale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-sale-promo-001' },
    payload: {
      items: [{ productId: prod.id, quantity: 1, serialCodes: ['RBAC-S2'] }],
      discountVnd: 0,
      promotionCode: 'SHOP10K',
      tenders: [{ method: 'cash', amountReceivedVnd: 90000 }],
    },
  });
  assert.equal(promoOnlySale.statusCode, 201, promoOnlySale.body);

  // Check /api/auth/me and /api/stores reflect updated permissions immediately, and audit_events logged previousPermissions/permissions
  const cashierMe = await app.inject({ method: 'GET', url: '/api/auth/me', headers: cashier.headers });
  assert.equal(cashierMe.statusCode, 200);
  assert.equal(cashierMe.json().stores[0].effectivePermissions.pos_max_discount_pct, 0);
  const cashierStores = await app.inject({ method: 'GET', url: '/api/stores', headers: cashier.headers });
  assert.equal(cashierStores.statusCode, 200);
  assert.equal(cashierStores.json().stores[0].effectivePermissions.pos_max_discount_pct, 0);

  const auditRes = await app.testDb.query(
    `SELECT metadata FROM audit_events WHERE store_id = $1 AND action = 'staff.access_changed' ORDER BY occurred_at DESC LIMIT 1`,
    [storeId]
  );
  const accessMeta = auditRes.rows[0].metadata;
  assert.deepEqual(accessMeta.previousPermissions, { pos_max_discount_pct: 5 });
  assert.deepEqual(accessMeta.permissions, { pos_max_discount_pct: 0 });
  assert.equal(accessMeta.effectivePermissions.pos_max_discount_pct, 0);

  // 2. view_cost_price masking across API + CSV exports when revoked on manager
  const maskMgr = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${manager.user.id}`,
    headers: owner.headers,
    payload: { role: 'manager', status: 'active', permissions: { view_cost_price: false } },
  });
  assert.equal(maskMgr.statusCode, 200);

  // Record a purchase first as owner so finance/purchases/exports have rows
  const nonSerialRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: owner.headers,
    payload: { sku: 'RBAC-STD', name: 'Áo thường', salePriceVnd: 200000, costVnd: 110000 },
  });
  const nonSerial = nonSerialRes.json().product;
  await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-rbac-purchase-000001' },
    payload: { productId: nonSerial.id, quantity: 5, unitCostVnd: 110000, amountPaidVnd: 0, supplierName: 'NCC RBAC' },
  });

  const mgrProds = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers: manager.headers });
  assert.equal(mgrProds.statusCode, 200);
  assert.ok(mgrProds.json().products.every((p) => p.cost_vnd === null && p.purchase_pack === null));

  const mgrInv = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory`, headers: manager.headers });
  assert.equal(mgrInv.statusCode, 200);
  assert.equal(mgrInv.json().summary.stockValueVnd, null);
  assert.ok(mgrInv.json().products.every((p) => p.cost_vnd === null && p.purchase_pack === null));

  const mgrLookup = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/serials/lookup?code=RBAC-S1`, headers: manager.headers });
  assert.equal(mgrLookup.json().product.cost_vnd, null);

  const mgrOrder = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${atCapSale.json().order.id}`, headers: manager.headers });
  assert.equal(mgrOrder.json().order.items[0].unit_cost_vnd, null);

  const mgrFin = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers: manager.headers });
  assert.equal(mgrFin.json().purchases[0].total_vnd, null);
  assert.equal(mgrFin.json().purchases[0].lines[0].unitCostVnd, null);

  const mgrAnalytics = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=1`, headers: manager.headers });
  assert.equal(mgrAnalytics.statusCode, 200);
  assert.equal(mgrAnalytics.json().summary.grossProfitVnd, null);
  assert.equal(mgrAnalytics.json().summary.netProfitVnd, null);

  // Blind costVnd change on PUT/bulk-update blocked (403); non-cost edit & POST default 0 allowed with masked response
  const mgrPutCost = await app.inject({
    method: 'PUT', url: `/api/stores/${storeId}/products/${nonSerial.id}`,
    headers: manager.headers,
    payload: { version: nonSerial.version + 1, costVnd: 99999 },
  });
  assert.equal(mgrPutCost.statusCode, 403);

  const mgrPutPrice = await app.inject({
    method: 'PUT', url: `/api/stores/${storeId}/products/${nonSerial.id}`,
    headers: manager.headers,
    payload: { version: nonSerial.version + 1, salePriceVnd: 210000 },
  });
  assert.equal(mgrPutPrice.statusCode, 200, mgrPutPrice.body);
  assert.equal(mgrPutPrice.json().product.cost_vnd, null);

  const mgrPostDefaultCost = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: manager.headers,
    payload: { sku: 'MGR-NOCOST', name: 'Tạo không thấy vốn', salePriceVnd: 50000 },
  });
  assert.equal(mgrPostDefaultCost.statusCode, 200, mgrPostDefaultCost.body);
  assert.equal(mgrPostDefaultCost.json().product.cost_vnd, null);

  // CSV exports strip cost columns when view_cost_price=false
  const csvProducts = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/products`, headers: manager.headers });
  assert.equal(csvProducts.statusCode, 200);
  assert.ok(!csvProducts.body.includes('Giá vốn (VND)'));
  assert.ok(!csvProducts.body.includes('Giá vốn mới (VND)'));

  const csvInventory = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/inventory`, headers: manager.headers });
  assert.ok(!csvInventory.body.includes('Giá vốn (VND)'));
  assert.ok(!csvInventory.body.includes('Giá trị tồn theo giá vốn (VND)'));

  const csvOrderLines = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/order-lines`, headers: manager.headers });
  assert.ok(!csvOrderLines.body.includes('Giá vốn lúc bán (VND)'));

  const csvPurchases = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/purchases`, headers: manager.headers });
  assert.ok(!csvPurchases.body.includes('Đơn giá nhập (VND)'));

  // 3. Boolean switches: void_or_return_order
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${manager.user.id}`,
    headers: owner.headers,
    payload: { role: 'manager', status: 'active', permissions: { void_or_return_order: false } },
  });
  const orderId1 = atCapSale.json().order.id;
  const order1Detail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId1}`, headers: owner.headers });
  const order1LineId = order1Detail.json().order.items[0].id;

  const mgrReturnBlocked = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId1}/returns`,
    headers: { ...manager.headers, 'idempotency-key': 'm1-rbac-mgr-ret-blk-01' },
    payload: { reason: 'Test', items: [{ orderLineId: order1LineId, quantity: 1 }] },
  });
  assert.equal(mgrReturnBlocked.statusCode, 403);

  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { void_or_return_order: true } },
  });
  const cashierReturnOk = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId1}/returns`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-csh-ret-ok-001' },
    payload: { reason: 'Khách trả', items: [{ orderLineId: order1LineId, quantity: 1 }] },
  });
  assert.equal(cashierReturnOk.statusCode, 201, cashierReturnOk.body);

  // 4. Boolean switches: record_cashbook & view_reports
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${accountant.user.id}`,
    headers: owner.headers,
    payload: { role: 'accountant', status: 'active', permissions: { record_cashbook: false, view_reports: false } },
  });
  const accCashBlocked = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...accountant.headers, 'idempotency-key': 'm1-rbac-acc-cash-blk-1' },
    payload: { direction: 'out', amountVnd: 10000, category: 'Chi phí' },
  });
  assert.equal(accCashBlocked.statusCode, 403);
  const accAnalyticsBlocked = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/analytics?days=1`, headers: accountant.headers,
  });
  assert.equal(accAnalyticsBlocked.statusCode, 403);

  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { record_cashbook: true, view_reports: true } },
  });
  const cshCashOk = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...cashier.headers, 'idempotency-key': 'm1-rbac-csh-cash-ok-01' },
    payload: { direction: 'out', amountVnd: 20000, category: 'Điện nước', method: 'cash' },
  });
  assert.equal(cshCashOk.statusCode, 201, cshCashOk.body);
  const cshBankBookOk = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/finance/cashbook?fund=bank`, headers: cashier.headers,
  });
  assert.equal(cshBankBookOk.statusCode, 200);
  const cshAnalyticsOk = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/analytics?days=1`, headers: cashier.headers,
  });
  assert.equal(cshAnalyticsOk.statusCode, 200);
  // view_cost_price is still false for cashier, so profits remain masked!
  assert.equal(cshAnalyticsOk.json().summary.netProfitVnd, null);

  // 5. Boolean switch: edit_products
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${stockkeeper.user.id}`,
    headers: owner.headers,
    payload: { role: 'stockkeeper', status: 'active', permissions: { edit_products: false } },
  });
  const stockProdBlocked = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: stockkeeper.headers,
    payload: { sku: 'STK-BLK', name: 'Blocked', salePriceVnd: 10000 },
  });
  assert.equal(stockProdBlocked.statusCode, 403);

  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { edit_products: true } },
  });
  const cshProdOk = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`,
    headers: cashier.headers,
    payload: { sku: 'CSH-OK', name: 'Cashier Product', salePriceVnd: 15000 },
  });
  assert.equal(cshProdOk.statusCode, 200, cshProdOk.body);
});

test('M1 Đợt 1+2 Suite 3: GET /dashboard accuracy (BigInt VND, timezone, returns, P&L, funds, debt, stock) & role/permission/warehouse gating', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'dash');
  const storeId = owner.store.id;

  // Create second warehouse and get default warehouse
  const whList1 = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: owner.headers });
  const defaultWh = whList1.json().warehouses[0];
  const wh2Res = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-create-wh2-001' },
    payload: { code: 'KHO-2', name: 'Kho Chi Nhánh 2' },
  });
  assert.equal(wh2Res.statusCode, 201, wh2Res.body);
  const wh2 = wh2Res.json().warehouse;

  // Open shift with 1,000,000 cash float? Note: openingFloat doesn't create a cash_movement; cash movements track actual ledger.
  const openShift = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-open-shift-001' },
    payload: { openingFloatVnd: 1000000 },
  });
  assert.equal(openShift.statusCode, 201);

  // Create products:
  // P1: active, stocked in defaultWh (10), threshold 2 -> OK
  // P2: active, low stock in defaultWh (2), threshold 5, stocked 20 in wh2 -> total 22 (OK storewide), in defaultWh only -> lowStock!
  // P3: active, out of stock everywhere (0) -> outOfStock!
  const p1 = (await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers: owner.headers,
    payload: { sku: 'DASH-P1', name: 'SP 1', salePriceVnd: 100000, costVnd: 60000, lowStockThreshold: 2 },
  })).json().product;
  const p2 = (await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers: owner.headers,
    payload: { sku: 'DASH-P2', name: 'SP 2', salePriceVnd: 50000, costVnd: 20000, lowStockThreshold: 5 },
  })).json().product;
  const p3 = (await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers: owner.headers,
    payload: { sku: 'DASH-P3', name: 'SP 3 Hết Hàng', salePriceVnd: 80000, costVnd: 40000, lowStockThreshold: 1 },
  })).json().product;

  // Receive stock: P1=10 in defaultWh, P2=2 in defaultWh, P2=20 in wh2
  await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-pur-wh1-000001' },
    payload: {
      warehouseId: defaultWh.id, amountPaidVnd: 0, supplierName: 'NCC Dash',
      items: [
        { productId: p1.id, quantity: 10, unitCostVnd: 60000 },
        { productId: p2.id, quantity: 2, unitCostVnd: 20000 },
      ],
    },
  });
  await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-pur-wh2-000001' },
    payload: {
      warehouseId: wh2.id, amountPaidVnd: 0, supplierName: 'NCC Dash',
      items: [{ productId: p2.id, quantity: 20, unitCostVnd: 20000 }],
    },
  });

  // Customer with credit limit 100,000 + opening balance 150,000 (overdue by credit_limit_vnd!)
  const custRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-create-cust-0001' },
    payload: { name: 'Khách Nợ Quá Hạn', phone: '0911222333', creditLimitVnd: 100000, openingBalanceVnd: 150000 },
  });
  assert.equal(custRes.statusCode, 201, custRes.body);
  const cust = custRes.json().customer;

  // Order 1 (backdated 2 days to yesterday -> excluded from todayRevenue/todayNetProfit)
  const yestSale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-sale-yest-0001' },
    payload: {
      items: [{ productId: p1.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 100000 }],
    },
  });
  assert.equal(yestSale.statusCode, 201);
  await app.testDb.query(`UPDATE orders SET occurred_at = now() - interval '2 days' WHERE id = $1`, [yestSale.json().order.id]);

  // Order 2 (today, qty 3 of P1 = 300,000, paid 300,000 bank_qr, then partial return 1 unit = 100,000 cash)
  const todaySale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-sale-today-001' },
    payload: {
      customerId: cust.id,
      items: [{ productId: p1.id, quantity: 3 }],
      tenders: [{ method: 'bank_qr', amountReceivedVnd: 300000 }],
    },
  });
  assert.equal(todaySale.statusCode, 201);
  const todayOrderId = todaySale.json().order.id;
  const todayOrderDetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${todayOrderId}`, headers: owner.headers });
  const todayLineId = todayOrderDetail.json().order.items[0].id;

  const retRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${todayOrderId}/returns`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-ret-today-0001' },
    payload: {
      reason: 'Trả 1 cái', restockPolicy: 'restock', refundMethod: 'cash',
      items: [{ orderLineId: todayLineId, quantity: 1 }],
    },
  });
  assert.equal(retRes.statusCode, 201);

  // Cash movements:
  // 1) Capital injection (includeInPnl: false) +500,000 cash (not in net profit, IS in cashBalanceVnd)
  const capRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-cash-cap-00001' },
    payload: { direction: 'in', amountVnd: 500000, method: 'cash', category: 'Góp vốn', includeInPnl: false },
  });
  assert.equal(capRes.statusCode, 201);

  // 2) P&L expense 30,000 cash (reduces todayNetProfitVnd by 30,000)
  const expRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-cash-exp-00001' },
    payload: { direction: 'out', amountVnd: 30000, method: 'cash', category: 'Điện nước', includeInPnl: true },
  });
  assert.equal(expRes.statusCode, 201);

  // 3) P&L expense 20,000 cash that gets voided (net 0 impact)
  const expVoidTarget = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-cash-exp2-0001' },
    payload: { direction: 'out', amountVnd: 20000, method: 'cash', category: 'Chi nhầm', includeInPnl: true },
  });
  assert.equal(expVoidTarget.statusCode, 201);
  await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements/${expVoidTarget.json().movement.movementId}/void`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-cash-void-0001' },
    payload: { reason: 'Nhập nhầm số' },
  });

  // 4) Internal transfer 50,000 cash -> bank
  const transferRes = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-transfers`,
    headers: { ...owner.headers, 'idempotency-key': 'm1-dash-transfer-00001' },
    payload: { fromFund: 'cash', toFund: 'bank', amountVnd: 50000 },
  });
  assert.equal(transferRes.statusCode, 201);

  // Check Owner Dashboard vs analytics?days=1 & finance/cashbook
  const dashOwnerRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: owner.headers });
  assert.equal(dashOwnerRes.statusCode, 200, dashOwnerRes.body);
  const dOwner = dashOwnerRes.json();

  const analyticsRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=1`, headers: owner.headers });
  const cashbookRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance/cashbook`, headers: owner.headers });

  // Today revenue: 300,000 - 100,000 return = 200,000 (yesterday's 100,000 excluded!)
  assert.equal(dOwner.todayRevenueVnd, '200000');
  assert.equal(dOwner.todayRevenueVnd, analyticsRes.json().summary.netSalesVnd);
  assert.equal(dOwner.todayOrderCount, 1);

  // Today net profit: gross profit (200,000 - 2*60,000 = 80,000) - 30,000 expense = 50,000
  assert.equal(dOwner.todayNetProfitVnd, '50000');
  assert.equal(dOwner.todayNetProfitVnd, analyticsRes.json().summary.netProfitVnd);

  // Funds:
  // Cash: +100k (yest) -100k (ret) +500k (cap) -30k (exp) -20k +20k (void) -50k (transfer) = 420,000
  // Bank: +300k (todaySale) +50k (transfer) = 350,000
  // Total: 770,000
  assert.equal(dOwner.canViewFunds, true);
  assert.equal(dOwner.canViewNetProfit, true);
  assert.equal(dOwner.cashBalanceVnd, '420000');
  assert.equal(dOwner.bankBalanceVnd, '350000');
  assert.equal(dOwner.totalFundVnd, '770000');
  assert.equal(dOwner.totalFundVnd, cashbookRes.json().balances.all.closingVnd);

  // Action items for owner (storewide stock: P1=8, P2=22, P3=0 -> lowStockCount=0, outOfStockCount=1)
  assert.equal(dOwner.actionItems.openShift.isOpen, true);
  assert.equal(dOwner.actionItems.openShift.sessionId, openShift.json().session.id);
  assert.equal(dOwner.actionItems.lowStockCount, 0);
  assert.equal(dOwner.actionItems.outOfStockCount, 1);
  assert.equal(dOwner.actionItems.debtorCount, 1);
  assert.equal(dOwner.actionItems.totalDebtVnd, '150000');
  assert.equal(dOwner.actionItems.overdueDebtCount, 1);
  assert.equal(dOwner.actionItems.overdueDebtVnd, '150000');
  assert.equal(dOwner.actionItems.pendingOfflineCount, 0);
  assert.equal(dOwner.recentOrders.length, 2);

  // Create staff for role/permission/warehouse matrix
  const cashier = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers, email: 'dash-cashier@example.com', role: 'cashier',
  });
  const manager = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers, email: 'dash-manager@example.com', role: 'manager',
  });
  const accountant = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers, email: 'dash-accountant@example.com', role: 'accountant',
  });
  const stockkeeperDefaultWh = await directCreateAndLogin(app, {
    storeId, ownerHeaders: owner.headers, email: 'dash-stock@example.com', role: 'stockkeeper',
    warehouseScopeMode: 'selected', warehouseIds: [defaultWh.id],
  });

  // Manager & Accountant defaults see all 3 numbers
  for (const actor of [manager, accountant]) {
    const d = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: actor.headers })).json();
    assert.equal(d.canViewFunds, true);
    assert.equal(d.canViewNetProfit, true);
    assert.equal(d.todayRevenueVnd, '200000');
    assert.equal(d.totalFundVnd, '770000');
    assert.equal(d.todayNetProfitVnd, '50000');
  }

  // Cashier default: hides revenue, funds, netProfit, debt; keeps openShift & recentOrders
  const dCashier = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: cashier.headers })).json();
  assert.equal(dCashier.canViewFunds, false);
  assert.equal(dCashier.canViewNetProfit, false);
  assert.equal(dCashier.todayRevenueVnd, null);
  assert.equal(dCashier.todayOrderCount, null);
  assert.equal(dCashier.cashBalanceVnd, null);
  assert.equal(dCashier.bankBalanceVnd, null);
  assert.equal(dCashier.totalFundVnd, null);
  assert.equal(dCashier.todayNetProfitVnd, null);
  assert.equal(dCashier.actionItems.overdueDebtCount, null);
  assert.equal(dCashier.actionItems.overdueDebtVnd, null);
  assert.equal(dCashier.actionItems.debtorCount, null);
  assert.equal(dCashier.actionItems.totalDebtVnd, null);
  assert.equal(dCashier.actionItems.openShift.isOpen, true);
  assert.equal(dCashier.recentOrders.length, 2);

  // Stockkeeper (scoped to defaultWh): hides money/debt/shift/orders, counts P2=2 (lowStockCount: 1) & P3=0 (outOfStockCount: 1)
  const dStock = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: stockkeeperDefaultWh.headers })).json();
  assert.equal(dStock.canViewFunds, false);
  assert.equal(dStock.canViewNetProfit, false);
  assert.equal(dStock.todayRevenueVnd, null);
  assert.equal(dStock.totalFundVnd, null);
  assert.equal(dStock.todayNetProfitVnd, null);
  assert.equal(dStock.actionItems.openShift, null);
  assert.equal(dStock.actionItems.debtorCount, null);
  assert.deepEqual(dStock.recentOrders, []);
  assert.equal(dStock.actionItems.lowStockCount, 1);
  assert.equal(dStock.actionItems.outOfStockCount, 1);

  // Manager with view_cost_price=false -> hides todayNetProfitVnd only
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${manager.user.id}`,
    headers: owner.headers,
    payload: { role: 'manager', status: 'active', permissions: { view_cost_price: false } },
  });
  const dMgrNoCost = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: manager.headers })).json();
  assert.equal(dMgrNoCost.todayRevenueVnd, '200000');
  assert.equal(dMgrNoCost.totalFundVnd, '770000');
  assert.equal(dMgrNoCost.canViewFunds, true);
  assert.equal(dMgrNoCost.canViewNetProfit, false);
  assert.equal(dMgrNoCost.todayNetProfitVnd, null);

  // Cashier with record_cashbook=true -> sees funds only
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { record_cashbook: true } },
  });
  const dCshCashbook = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: cashier.headers })).json();
  assert.equal(dCshCashbook.canViewFunds, true);
  assert.equal(dCshCashbook.totalFundVnd, '770000');
  assert.equal(dCshCashbook.todayRevenueVnd, null);
  assert.equal(dCshCashbook.canViewNetProfit, false);
  assert.equal(dCshCashbook.todayNetProfitVnd, null);

  // Cashier with view_reports=true (view_cost_price=false) -> sees revenue + funds, NOT netProfit
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { view_reports: true } },
  });
  const dCshReports = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: cashier.headers })).json();
  assert.equal(dCshReports.todayRevenueVnd, '200000');
  assert.equal(dCshReports.totalFundVnd, '770000');
  assert.equal(dCshReports.canViewNetProfit, false);
  assert.equal(dCshReports.todayNetProfitVnd, null);

  // Cashier with view_reports=true AND view_cost_price=true -> sees netProfit too!
  await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${cashier.user.id}`,
    headers: owner.headers,
    payload: { role: 'cashier', status: 'active', permissions: { view_reports: true, view_cost_price: true } },
  });
  const dCshAll = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/dashboard`, headers: cashier.headers })).json();
  assert.equal(dCshAll.canViewNetProfit, true);
  assert.equal(dCshAll.todayNetProfitVnd, '50000');
});
