'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

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
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({ pool, logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  app.testDb = db;
  t.after(() => app.close());
  return app;
}

function cookiesFrom(response) {
  const setCookies = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']];
  return Object.fromEntries(setCookies.map((value) => {
    const [pair] = value.split(';');
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function registerAndLogin(app, { email, displayName, storeName }) {
  const registration = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email, displayName, storeName, password: 'correct horse battery staple 47' },
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const verificationUrl = registration.json().developmentVerificationUrl;
  assert.ok(verificationUrl, 'development mode provides an email verification link');
  const token = new URLSearchParams(new URL(verificationUrl).hash.slice(1)).get('token');
  const verify = await app.inject({
    method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token },
  });
  assert.equal(verify.statusCode, 200, verify.body);

  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin },
    payload: { email, password: 'correct horse battery staple 47' },
  });
  assert.equal(login.statusCode, 200, login.body);
  return { cookies: cookiesFrom(login), user: login.json().user, store: login.json().stores[0] };
}

async function inviteAndLogin(app, { storeId, ownerHeaders, email, role }) {
  const invitation = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/staff/invitations`,
    headers: ownerHeaders, payload: { email, role },
  });
  assert.equal(invitation.statusCode, 201, invitation.body);
  const inviteUrl = invitation.json().developmentInviteUrl;
  assert.ok(inviteUrl, 'test mode exposes an invite link without sending external email');
  const inviteToken = new URLSearchParams(new URL(inviteUrl).hash.slice(1)).get('invite');
  assert.ok(inviteToken);

  const password = 'staff-password-for-test-47';
  const registration = await app.inject({
    method: 'POST', url: `/api/invitations/${inviteToken}/register`, headers: { origin },
    payload: { displayName: `${role} kiểm tra`, password },
  });
  assert.equal(registration.statusCode, 201, registration.body);
  const verificationUrl = registration.json().developmentVerificationUrl;
  assert.ok(verificationUrl, 'test mode exposes a verification link without sending external email');
  const verificationToken = new URLSearchParams(new URL(verificationUrl).hash.slice(1)).get('token');
  const verified = await app.inject({
    method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: verificationToken },
  });
  assert.equal(verified.statusCode, 200, verified.body);

  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password },
  });
  assert.equal(login.statusCode, 200, login.body);
  const store = login.json().stores.find((item) => item.id === storeId);
  assert.equal(store?.role, role);
  const cookies = cookiesFrom(login);
  return {
    cookies,
    user: login.json().user,
    store,
    headers: { cookie: cookieHeader(cookies), origin, 'x-csrf-token': cookies.slink_csrf },
  };
}

test('account verification, session security, and tenant-scoped product workflow', async (t) => {
  const app = await testApp(t);

  const pending = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email: 'owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Slink Test', password: 'correct horse battery staple 47' },
  });
  assert.equal(pending.statusCode, 201, pending.body);
  const unverifiedLogin = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin },
    payload: { email: 'owner@example.com', password: 'correct horse battery staple 47' },
  });
  assert.equal(unverifiedLogin.statusCode, 401);

  const first = await registerAndLogin(app, {
    email: 'owner2@example.com', displayName: 'Chủ cửa hàng', storeName: 'Slink Test 2',
  });
  assert.equal(first.store.role, 'owner');
  assert.match(first.cookies.slink_session, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(first.cookies.slink_csrf, /^[A-Za-z0-9_-]{40,}$/);
  const headers = { cookie: cookieHeader(first.cookies) };

  const created = await app.inject({
    method: 'POST', url: `/api/stores/${first.store.id}/products`,
    headers: { ...headers, origin, 'x-csrf-token': first.cookies.slink_csrf },
    payload: { sku: 'CÀ-PHÊ-01', name: 'Cà phê rang xay', salePriceVnd: 85000, costVnd: 52000, lowStockThreshold: 2.5 },
  });
  assert.equal(created.statusCode, 200, created.body);
  const product = created.json().product;
  assert.equal(product.on_hand, '0');
  assert.equal(product.sale_price_vnd, '85000');

  const listed = await app.inject({ method: 'GET', url: `/api/stores/${first.store.id}/products?q=phê`, headers });
  assert.equal(listed.statusCode, 200, listed.body);
  assert.equal(listed.json().products.length, 1);
  assert.equal(listed.json().products[0].id, product.id);

  const duplicate = await app.inject({
    method: 'POST', url: `/api/stores/${first.store.id}/products`,
    headers: { ...headers, origin, 'x-csrf-token': first.cookies.slink_csrf },
    payload: { sku: 'cà-phê-01', name: 'Mã trùng', salePriceVnd: 0 },
  });
  assert.equal(duplicate.statusCode, 409, duplicate.body);

  const updated = await app.inject({
    method: 'PUT', url: `/api/stores/${first.store.id}/products/${product.id}`,
    headers: { ...headers, origin, 'x-csrf-token': first.cookies.slink_csrf },
    payload: { version: 1, salePriceVnd: 90000 },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().product.version, 2);
  const stale = await app.inject({
    method: 'PUT', url: `/api/stores/${first.store.id}/products/${product.id}`,
    headers: { ...headers, origin, 'x-csrf-token': first.cookies.slink_csrf },
    payload: { version: 1, salePriceVnd: 91000 },
  });
  assert.equal(stale.statusCode, 409);

  const second = await registerAndLogin(app, {
    email: 'owner3@example.com', displayName: 'Chủ khác', storeName: 'Cửa hàng khác',
  });
  const crossTenant = await app.inject({
    method: 'GET', url: `/api/stores/${first.store.id}/products`, headers: { cookie: cookieHeader(second.cookies) },
  });
  assert.equal(crossTenant.statusCode, 403);

  const badCsrf = await app.inject({
    method: 'POST', url: `/api/stores/${first.store.id}/products`,
    headers: { ...headers, origin, 'x-csrf-token': 'wrong-token' },
    payload: { sku: 'X', name: 'Sai', salePriceVnd: 10 },
  });
  assert.equal(badCsrf.statusCode, 403);

  const logout = await app.inject({
    method: 'POST', url: '/api/auth/logout', headers: { ...headers, origin, 'x-csrf-token': first.cookies.slink_csrf },
  });
  assert.equal(logout.statusCode, 200, logout.body);
  const afterLogout = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
  assert.equal(afterLogout.statusCode, 401);
});

test('product import validates all rows, writes opening stock atomically, and replays safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'product-import@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng nhập danh mục',
  });
  const storeId = owner.store.id;
  const headers = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };
  const items = [
    {
      sku: 'OPEN-001', barcode: '8930000000001', name: 'Hàng đầu kỳ có tồn',
      salePriceVnd: 15000, costVnd: 9000, lowStockThreshold: '1.250', openingQuantity: '2.125',
    },
    {
      sku: 'OPEN-002', barcode: '8930000000002', name: 'Hàng đầu kỳ chưa có tồn',
      salePriceVnd: 25000, costVnd: 0, openingQuantity: '0',
    },
  ];
  const importHeaders = { ...headers, 'idempotency-key': 'product-import-acceptance-001' };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`, headers: importHeaders, payload: { items },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.json().count, 2);
  assert.equal(imported.json().products[0].sale_price_vnd, '15000');
  assert.equal(imported.json().products[0].cost_vnd, '9000');
  assert.equal(imported.json().products[0].on_hand, '2.125');

  const catalog = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(catalog.statusCode, 200, catalog.body);
  assert.equal(catalog.json().total, 2);
  assert.equal(catalog.json().products.find((product) => product.sku === 'OPEN-001').on_hand, '2.125');

  const replay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`, headers: importHeaders, payload: { items },
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(replay.json(), imported.json());

  const changedPayload = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`, headers: importHeaders,
    payload: { items: [{ ...items[0], salePriceVnd: 16000 }] },
  });
  assert.equal(changedPayload.statusCode, 409, changedPayload.body);
  assert.equal(changedPayload.json().error.code, 'idempotency_conflict');

  const invalidRows = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'product-import-invalid-rows-01' },
    payload: { items: [
      { sku: 'SHOULD-NOT-INSERT', name: 'Dòng hợp lệ', salePriceVnd: 100, costVnd: 50, openingQuantity: '3' },
      { sku: 'INVALID-ROW', name: 'Dòng sai giá', salePriceVnd: -1, costVnd: 0, openingQuantity: '0' },
    ] },
  });
  assert.equal(invalidRows.statusCode, 400, invalidRows.body);
  const duplicateRows = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'product-import-duplicate-rows-01' },
    payload: { items: [
      { sku: 'DUP-001', name: 'Dòng trùng một', salePriceVnd: 100, costVnd: 0, openingQuantity: '0' },
      { sku: 'dup-001', name: 'Dòng trùng hai', salePriceVnd: 100, costVnd: 0, openingQuantity: '0' },
    ] },
  });
  assert.equal(duplicateRows.statusCode, 400, duplicateRows.body);
  assert.equal(duplicateRows.json().error.code, 'duplicate_import_sku');

  const existingDuplicate = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'product-import-existing-sku-01' },
    payload: { items: [{ ...items[0], name: 'SKU đã tồn tại' }] },
  });
  assert.equal(existingDuplicate.statusCode, 409, existingDuplicate.body);
  assert.equal(existingDuplicate.json().error.code, 'product_conflict');

  const cashier = await inviteAndLogin(app, {
    storeId,
    ownerHeaders: headers,
    email: 'product-import-cashier@example.com',
    role: 'cashier',
  });
  const denied = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...cashier.headers, 'idempotency-key': 'product-import-cashier-deny-01' },
    payload: { items: [{ sku: 'CASHIER-001', name: 'Không được nhập', salePriceVnd: 100, costVnd: 0, openingQuantity: '0' }] },
  });
  assert.equal(denied.statusCode, 403, denied.body);

  const countsBeforeFailure = await app.testDb.query(
    `SELECT
       (SELECT count(*)::int FROM products WHERE store_id = $1) AS products,
       (SELECT count(*)::int FROM inventory_balances WHERE store_id = $1) AS balances,
       (SELECT count(*)::int FROM product_cost_history WHERE store_id = $1) AS costs,
       (SELECT count(*)::int FROM inventory_movements WHERE store_id = $1) AS movements,
       (SELECT count(*)::int FROM audit_events WHERE store_id = $1) AS audits,
       (SELECT count(*)::int FROM idempotency_records WHERE store_id = $1) AS idempotency`,
    [storeId]
  );
  await app.testDb.exec(`
    CREATE FUNCTION fail_products_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'products.imported' THEN RAISE EXCEPTION 'injected products.imported audit failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_products_import_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_products_import_audit();
  `);
  const failingImport = {
    items: [{ sku: 'ROLLBACK-001', name: 'Danh mục phải rollback', salePriceVnd: 1200, costVnd: 700, openingQuantity: '4.100' }],
  };
  const rollbackHeaders = { ...headers, 'idempotency-key': 'product-import-audit-rollback-01' };
  const failed = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`, headers: rollbackHeaders, payload: failingImport,
  });
  assert.equal(failed.statusCode, 500, failed.body);
  const countsAfterFailure = await app.testDb.query(
    `SELECT
       (SELECT count(*)::int FROM products WHERE store_id = $1) AS products,
       (SELECT count(*)::int FROM inventory_balances WHERE store_id = $1) AS balances,
       (SELECT count(*)::int FROM product_cost_history WHERE store_id = $1) AS costs,
       (SELECT count(*)::int FROM inventory_movements WHERE store_id = $1) AS movements,
       (SELECT count(*)::int FROM audit_events WHERE store_id = $1) AS audits,
       (SELECT count(*)::int FROM idempotency_records WHERE store_id = $1) AS idempotency`,
    [storeId]
  );
  assert.deepEqual(countsAfterFailure.rows[0], countsBeforeFailure.rows[0]);
  await app.testDb.exec('DROP TRIGGER fail_products_import_audit ON audit_events; DROP FUNCTION fail_products_import_audit();');

  const retry = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`, headers: rollbackHeaders, payload: failingImport,
  });
  assert.equal(retry.statusCode, 201, retry.body);
  assert.equal(retry.json().products[0].on_hand, '4.1');
  const finalCatalog = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(finalCatalog.json().total, 3);
});

test('purchase orders receive partial quantities once and keep stock, payable, and audit records aligned', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'purchase-order@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng đơn nhập',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const createdProduct = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers,
    payload: { sku: 'PO-001', name: 'Hàng đặt nhập', salePriceVnd: 25000, costVnd: 12000 },
  });
  assert.equal(createdProduct.statusCode, 200, createdProduct.body);
  const productId = createdProduct.json().product.id;

  const createdSupplier = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers`,
    headers: { ...headers, 'idempotency-key': 'po-supplier-create-0001' },
    payload: { name: 'Nhà cung cấp đơn thử nghiệm' },
  });
  assert.equal(createdSupplier.statusCode, 201, createdSupplier.body);
  const supplierId = createdSupplier.json().supplier.id;

  const destination = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'po-warehouse-create-0001' },
    payload: { code: 'PO-BR-02', name: 'Kho nhận đơn' },
  });
  assert.equal(destination.statusCode, 201, destination.body);
  const destinationWarehouseId = destination.json().warehouse.id;
  const orderPayload = { supplierId, warehouseId: destinationWarehouseId, note: 'Nhập theo đợt', items: [{ productId, quantity: '5', unitCostVnd: '10001' }] };
  const orderHeaders = { ...headers, 'idempotency-key': 'po-create-request-00001' };
  const createdOrder = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders`, headers: orderHeaders, payload: orderPayload,
  });
  assert.equal(createdOrder.statusCode, 201, createdOrder.body);
  assert.equal(createdOrder.json().purchaseOrder.status, 'draft');
  assert.equal(createdOrder.json().purchaseOrder.totalVnd, '50005');
  assert.equal(createdOrder.json().purchaseOrder.warehouseId, destinationWarehouseId);
  assert.equal(createdOrder.json().purchaseOrder.warehouseName, 'Kho nhận đơn');
  const orderId = createdOrder.json().purchaseOrder.id;
  const replay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders`, headers: orderHeaders, payload: orderPayload,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(replay.json(), createdOrder.json());

  const placed = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/place`,
    headers: { ...headers, 'idempotency-key': 'po-place-request-000001' }, payload: {},
  });
  assert.equal(placed.statusCode, 200, placed.body);
  assert.equal(placed.json().purchaseOrder.status, 'ordered');
  const archivePendingPurchaseOrder = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${destinationWarehouseId}/archive`,
    headers: { ...headers, 'idempotency-key': 'po-warehouse-archive-open-01' },
    payload: { reason: 'Thử lưu trữ kho đang nhận đơn' },
  });
  assert.equal(archivePendingPurchaseOrder.statusCode, 409, archivePendingPurchaseOrder.body);
  assert.equal(archivePendingPurchaseOrder.json().error.code, 'warehouse_not_empty');

  const financeBeforeReceipt = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(financeBeforeReceipt.statusCode, 200, financeBeforeReceipt.body);
  const orderLineId = financeBeforeReceipt.json().purchaseOrders.find((order) => order.id === orderId).lines[0].id;
  const receiptPayload = { items: [{ purchaseOrderLineId: orderLineId, quantity: '2' }], amountPaidVnd: '0', note: 'Nhận đợt một' };
  const receiptHeaders = { ...headers, 'idempotency-key': 'po-receive-request-00001' };
  const partialReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/receipts`, headers: receiptHeaders, payload: receiptPayload,
  });
  assert.equal(partialReceipt.statusCode, 201, partialReceipt.body);
  assert.equal(partialReceipt.json().purchaseOrder.status, 'partially_received');
  assert.equal(partialReceipt.json().purchase.totalVnd, '20002');
  const receiptReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/receipts`, headers: receiptHeaders, payload: receiptPayload,
  });
  assert.equal(receiptReplay.statusCode, 201, receiptReplay.body);
  assert.equal(receiptReplay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(receiptReplay.json(), partialReceipt.json());

  const overReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/receipts`,
    headers: { ...headers, 'idempotency-key': 'po-overreceive-request-01' },
    payload: { items: [{ purchaseOrderLineId: orderLineId, quantity: '4' }] },
  });
  assert.equal(overReceipt.statusCode, 409, overReceipt.body);
  assert.equal(overReceipt.json().error.code, 'purchase_order_quantity_exceeded');

  const catalog = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(catalog.statusCode, 200, catalog.body);
  assert.equal(catalog.json().products[0].on_hand, '2.000');
  const mainWarehouse = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers });
  const mainWarehouseId = mainWarehouse.json().warehouses.find((warehouse) => warehouse.is_default).id;
  const mainStock = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${mainWarehouseId}`, headers });
  const destinationStock = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(mainStock.json().products[0].on_hand, '0.000');
  assert.equal(destinationStock.json().products[0].on_hand, '2.000');
  const financeAfterReceipt = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(financeAfterReceipt.statusCode, 200, financeAfterReceipt.body);
  const storedOrder = financeAfterReceipt.json().purchaseOrders.find((order) => order.id === orderId);
  assert.equal(storedOrder.status, 'partially_received');
  assert.equal(storedOrder.warehouse_id, destinationWarehouseId);
  assert.equal(storedOrder.warehouse_name, 'Kho nhận đơn');
  assert.equal(storedOrder.lines[0].quantityReceived, '2.000');
  assert.equal(financeAfterReceipt.json().summary.supplierPayableVnd, '20002');
  const purchaseOrderCsv = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/exports/purchase-orders?warehouseId=${destinationWarehouseId}`, headers,
  });
  assert.equal(purchaseOrderCsv.statusCode, 200, purchaseOrderCsv.body);
  const orderCsvLines = purchaseOrderCsv.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.match(orderCsvLines[0], /^"Mã kho","Kho nhận","Mã đơn đặt hàng"/);
  assert.equal(orderCsvLines.length, 2);
  assert.ok(orderCsvLines[1].includes(destinationWarehouseId));
  assert.ok(orderCsvLines[1].includes('Kho nhận đơn'));
  const receiptCsv = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/exports/purchases?warehouseId=${destinationWarehouseId}`, headers,
  });
  assert.equal(receiptCsv.statusCode, 200, receiptCsv.body);
  const receiptCsvLines = receiptCsv.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.match(receiptCsvLines[0], /^"Mã kho","Kho nhận","Mã phiếu nhập"/);
  assert.equal(receiptCsvLines.length, 2);
  assert.ok(receiptCsvLines[1].includes(destinationWarehouseId));
  const audit = await app.testDb.query(
    `SELECT action FROM audit_events WHERE store_id = $1 AND entity_type IN ('purchase', 'purchase_order') ORDER BY occurred_at, id`,
    [storeId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action).sort(), [
    'purchase_order.created', 'purchase_order.placed', 'purchase.received', 'purchase_order.receipt_recorded',
  ].sort());
  const finalReceiptPayload = { items: [{ purchaseOrderLineId: orderLineId, quantity: '3' }], amountPaidVnd: '0', note: 'Nhận đủ đợt cuối' };
  const finalReceiptHeaders = { ...headers, 'idempotency-key': 'po-receive-final-request-01' };
  const finalReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/receipts`, headers: finalReceiptHeaders, payload: finalReceiptPayload,
  });
  assert.equal(finalReceipt.statusCode, 201, finalReceipt.body);
  assert.equal(finalReceipt.json().purchaseOrder.status, 'received');
  const completedReceiptReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders/${orderId}/receipts`, headers: finalReceiptHeaders, payload: finalReceiptPayload,
  });
  assert.equal(completedReceiptReplay.statusCode, 201, completedReceiptReplay.body);
  assert.equal(completedReceiptReplay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(completedReceiptReplay.json(), finalReceipt.json());
  const completedOrder = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(completedOrder.statusCode, 200, completedOrder.body);
  assert.equal(completedOrder.json().purchaseOrders.find((order) => order.id === orderId).status, 'received');
  assert.equal(completedOrder.json().summary.supplierPayableVnd, '50005');
  const completedDestinationStock = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(completedDestinationStock.json().products[0].on_hand, '5.000');
  const archiveStockedWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${destinationWarehouseId}/archive`,
    headers: { ...headers, 'idempotency-key': 'po-warehouse-archive-stock-01' },
    payload: { reason: 'Thử lưu trữ kho vừa nhận đủ hàng' },
  });
  assert.equal(archiveStockedWarehouse.statusCode, 409, archiveStockedWarehouse.body);
  assert.equal(archiveStockedWarehouse.json().error.code, 'warehouse_not_empty');
  const completedAudit = await app.testDb.query(
    `SELECT action FROM audit_events WHERE store_id = $1 AND entity_type IN ('purchase', 'purchase_order') ORDER BY occurred_at, id`,
    [storeId]
  );
  assert.deepEqual(completedAudit.rows.map((row) => row.action).sort(), [
    'purchase_order.created', 'purchase_order.placed',
    'purchase.received', 'purchase_order.receipt_recorded',
    'purchase.received', 'purchase_order.receipt_recorded',
  ].sort());
});

test('warehouse transfer dispatch and partial receipts conserve stock across locations and replay safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'warehouse-transfer@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng nhiều kho',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'warehouse-product-import-001' },
    payload: { items: [{ sku: 'WH-001', name: 'Mặt hàng chuyển kho', salePriceVnd: 18000, costVnd: 9000, openingQuantity: '10' }] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const productId = imported.json().products[0].id;
  const defaultWarehouse = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers });
  assert.equal(defaultWarehouse.statusCode, 200, defaultWarehouse.body);
  const sourceWarehouseId = defaultWarehouse.json().warehouses[0].id;
  assert.equal(defaultWarehouse.json().warehouses[0].is_default, true);

  const createdWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-create-store-0001' },
    payload: { code: 'BR-02', name: 'Kho chi nhánh 2' },
  });
  assert.equal(createdWarehouse.statusCode, 201, createdWarehouse.body);
  const destinationWarehouseId = createdWarehouse.json().warehouse.id;

  const transferPayload = {
    sourceWarehouseId, destinationWarehouseId, note: 'Bổ sung chi nhánh',
    items: [{ productId, quantity: '4' }],
  };
  const transferHeaders = { ...headers, 'idempotency-key': 'warehouse-transfer-create-001' };
  const createdTransfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers`, headers: transferHeaders, payload: transferPayload,
  });
  assert.equal(createdTransfer.statusCode, 201, createdTransfer.body);
  const transferId = createdTransfer.json().transfer.id;
  const archiveOpenTransfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${destinationWarehouseId}/archive`,
    headers: { ...headers, 'idempotency-key': 'warehouse-archive-open-0001' }, payload: { reason: 'Đóng kho thử' },
  });
  assert.equal(archiveOpenTransfer.statusCode, 409, archiveOpenTransfer.body);
  assert.equal(archiveOpenTransfer.json().error.code, 'warehouse_not_empty');
  const transferList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouse-transfers`, headers });
  assert.equal(transferList.statusCode, 200, transferList.body);
  const transferLineId = transferList.json().transfers.find((row) => row.id === transferId).lines[0].id;

  const dispatchHeaders = { ...headers, 'idempotency-key': 'warehouse-transfer-dispatch-01' };
  const dispatched = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`, headers: dispatchHeaders, payload: {},
  });
  assert.equal(dispatched.statusCode, 200, dispatched.body);
  const dispatchReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`, headers: dispatchHeaders, payload: {},
  });
  assert.equal(dispatchReplay.statusCode, 200, dispatchReplay.body);
  assert.equal(dispatchReplay.headers['idempotent-replayed'], 'true');

  const sourceAfterDispatch = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${sourceWarehouseId}`, headers });
  assert.equal(sourceAfterDispatch.statusCode, 200, sourceAfterDispatch.body);
  assert.equal(sourceAfterDispatch.json().products[0].on_hand, '6.000');
  const destinationBeforeReceipt = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(destinationBeforeReceipt.statusCode, 200, destinationBeforeReceipt.body);
  assert.equal(destinationBeforeReceipt.json().products[0].on_hand, '0.000');

  const firstReceiptPayload = { note: 'Nhận một phần', items: [{ transferLineId, quantity: '2' }] };
  const receiptHeaders = { ...headers, 'idempotency-key': 'warehouse-transfer-receive-01' };
  const firstReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`, headers: receiptHeaders, payload: firstReceiptPayload,
  });
  assert.equal(firstReceipt.statusCode, 200, firstReceipt.body);
  assert.equal(firstReceipt.json().transfer.status, 'partially_received');
  const firstReceiptReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`, headers: receiptHeaders, payload: firstReceiptPayload,
  });
  assert.equal(firstReceiptReplay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(firstReceiptReplay.json(), firstReceipt.json());

  const destinationAfterFirstReceipt = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(destinationAfterFirstReceipt.statusCode, 200, destinationAfterFirstReceipt.body);
  assert.equal(destinationAfterFirstReceipt.json().products[0].on_hand, '2.000');
  const overReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: { ...headers, 'idempotency-key': 'warehouse-transfer-overreceive-01' },
    payload: { items: [{ transferLineId, quantity: '3' }] },
  });
  assert.equal(overReceipt.statusCode, 409, overReceipt.body);
  assert.equal(overReceipt.json().error.code, 'transfer_quantity_exceeded');

  const finalReceiptPayload = { items: [{ transferLineId, quantity: '2' }] };
  const finalReceiptHeaders = { ...headers, 'idempotency-key': 'warehouse-transfer-receive-02' };
  const finalReceipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: finalReceiptHeaders,
    payload: finalReceiptPayload,
  });
  assert.equal(finalReceipt.statusCode, 200, finalReceipt.body);
  assert.equal(finalReceipt.json().transfer.status, 'received');
  const finalReceiptReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: finalReceiptHeaders, payload: finalReceiptPayload,
  });
  assert.equal(finalReceiptReplay.statusCode, 200, finalReceiptReplay.body);
  assert.equal(finalReceiptReplay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(finalReceiptReplay.json(), finalReceipt.json());
  const sourceFinal = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${sourceWarehouseId}`, headers });
  const destinationFinal = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(sourceFinal.json().products[0].on_hand, '6.000');
  assert.equal(destinationFinal.json().products[0].on_hand, '4.000');
  const totalStock = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(totalStock.json().products[0].on_hand, '10.000');
  const movementCount = await app.testDb.query(
    `SELECT movement_type, COUNT(*)::int AS count FROM inventory_movements
     WHERE store_id = $1 AND source_type = 'warehouse_transfer' AND source_id = $2 GROUP BY movement_type ORDER BY movement_type`,
    [storeId, transferId]
  );
  assert.deepEqual(movementCount.rows, [
    { movement_type: 'transfer_in', count: 2 }, { movement_type: 'transfer_out', count: 1 },
  ]);
  const emptyWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-create-empty-0001' },
    payload: { code: 'BR-EMPTY', name: 'Kho chưa sử dụng' },
  });
  assert.equal(emptyWarehouse.statusCode, 201, emptyWarehouse.body);
  const archived = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${emptyWarehouse.json().warehouse.id}/archive`,
    headers: { ...headers, 'idempotency-key': 'warehouse-archive-empty-0001' }, payload: { reason: 'Không phát sinh sử dụng' },
  });
  assert.equal(archived.statusCode, 200, archived.body);
  assert.equal(archived.json().warehouse.status, 'archived');
});

test('warehouse-scoped CSV stock counts preview without writes, commit atomically, and replay safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'bulk-stock-count@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng kiểm kê CSV',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'bulk-count-products-0001' },
    payload: { items: [
      { sku: 'COUNT-A', name: 'Kiểm kê A', salePriceVnd: 10000, costVnd: 5000, openingQuantity: '2.5' },
      { sku: 'COUNT-B', name: 'Kiểm kê B', salePriceVnd: 12000, costVnd: 6000, openingQuantity: '4' },
    ] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const warehousesResponse = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers });
  assert.equal(warehousesResponse.statusCode, 200, warehousesResponse.body);
  const defaultWarehouseId = warehousesResponse.json().warehouses.find((warehouse) => warehouse.is_default).id;
  const secondWarehouseResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'bulk-count-warehouse-01' },
    payload: { code: 'COUNT-02', name: 'Kho kiểm kê phụ' },
  });
  assert.equal(secondWarehouseResponse.statusCode, 201, secondWarehouseResponse.body);
  const warehouseId = secondWarehouseResponse.json().warehouse.id;

  const productsCsv = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/products`, headers });
  assert.equal(productsCsv.statusCode, 200, productsCsv.body);
  const productCsvLines = productsCsv.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(productCsvLines.length, 3, 'the catalog export must keep one row per product after adding warehouses');
  for (const product of imported.json().products) {
    const matchingLines = productCsvLines.slice(1).filter((line) => line.includes(product.id));
    assert.equal(matchingLines.length, 1, `product ${product.id} should not be repeated once per warehouse`);
  }

  const inventoryCsv = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/exports/inventory?warehouseId=${warehouseId}`, headers,
  });
  assert.equal(inventoryCsv.statusCode, 200, inventoryCsv.body);
  assert.match(inventoryCsv.headers['content-type'], /text\/csv/);
  const csvLines = inventoryCsv.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(csvLines.length, 3, 'the selected warehouse export has one row per product, not one row per warehouse');
  assert.match(csvLines[0], /^"Mã kho","Kho","Mã sản phẩm"/);
  assert.ok(csvLines.slice(1).every((line) => line.includes(warehouseId)));
  assert.ok(csvLines.slice(1).every((line) => !line.includes(defaultWarehouseId)));
  const movementCsv = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/exports/inventory-movements?warehouseId=${warehouseId}`, headers,
  });
  assert.equal(movementCsv.statusCode, 200, movementCsv.body);
  const movementCsvLines = movementCsv.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.match(movementCsvLines[0], /^"Mã kho","Kho","Mã biến động"/);
  assert.equal(movementCsvLines.length, 1, 'empty warehouse has no movement records');

  const locationBefore = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  assert.equal(locationBefore.statusCode, 200, locationBefore.body);
  const locationProducts = locationBefore.json().products;
  assert.equal(locationProducts.length, 2);
  assert.ok(locationProducts.every((product) => product.on_hand === '0.000'));
  const productA = imported.json().products.find((product) => product.sku === 'COUNT-A');
  const productB = imported.json().products.find((product) => product.sku === 'COUNT-B');
  const currentA = locationProducts.find((product) => product.id === productA.id);
  const currentB = locationProducts.find((product) => product.id === productB.id);
  const countPayload = {
    warehouseId,
    items: [
      { productId: productA.id, expectedInventoryVersion: Number(currentA.inventory_version), count: '1.250', sourceLine: 3 },
      { productId: productB.id, expectedInventoryVersion: Number(currentB.inventory_version), count: '0', sourceLine: 4 },
    ],
  };
  const preview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk/preview`, headers, payload: countPayload,
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().valid, true);
  assert.equal(preview.json().warehouseId, warehouseId);
  assert.equal(preview.json().changedCount, 1);
  assert.equal(preview.json().unchangedCount, 1);
  const stillUnchanged = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  assert.equal(stillUnchanged.json().products.find((product) => product.id === productA.id).on_hand, '0.000', 'preview must not write inventory');

  const writeHeaders = { ...headers, 'idempotency-key': 'bulk-count-commit-request-01' };
  const counted = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`, headers: writeHeaders,
    payload: { ...countPayload, reason: 'Kiểm kê cuối ngày' },
  });
  assert.equal(counted.statusCode, 200, counted.body);
  assert.equal(counted.json().count, 2);
  assert.equal(counted.json().changedCount, 1);
  assert.equal(counted.json().unchangedCount, 1);
  assert.equal(counted.json().changed[0].onHand, '1.25');
  const movementCsvAfterCount = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/exports/inventory-movements?warehouseId=${warehouseId}`, headers,
  });
  assert.equal(movementCsvAfterCount.statusCode, 200, movementCsvAfterCount.body);
  const countedMovementLines = movementCsvAfterCount.body.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(countedMovementLines.length, 2);
  assert.ok(countedMovementLines[1].includes(warehouseId));
  assert.ok(countedMovementLines[1].includes('Kiểm kê cuối ngày'));
  const replay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`, headers: writeHeaders,
    payload: { ...countPayload, reason: 'Kiểm kê cuối ngày' },
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(replay.json(), counted.json());
  const changedPayloadReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`, headers: writeHeaders,
    payload: { ...countPayload, reason: 'Kiểm kê cuối ngày', items: countPayload.items.map((item) => ({ ...item, count: '2' })) },
  });
  assert.equal(changedPayloadReplay.statusCode, 409, changedPayloadReplay.body);
  assert.equal(changedPayloadReplay.json().error.code, 'idempotency_conflict');

  const stalePreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk/preview`, headers, payload: countPayload,
  });
  assert.equal(stalePreview.statusCode, 200, stalePreview.body);
  assert.equal(stalePreview.json().valid, false);
  const beforeStaleCommit = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  const staleWrite = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`,
    headers: { ...headers, 'idempotency-key': 'bulk-count-stale-request-001' },
    payload: { warehouseId, reason: 'Không được ghi nếu phiên bản cũ', items: countPayload.items.map((item) => ({ ...item, count: '3' })) },
  });
  assert.equal(staleWrite.statusCode, 409, staleWrite.body);
  assert.equal(staleWrite.json().error.code, 'inventory_version_conflict');
  const afterStaleCommit = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  assert.deepEqual(
    afterStaleCommit.json().products.map((product) => [product.id, product.on_hand, product.inventory_version]),
    beforeStaleCommit.json().products.map((product) => [product.id, product.on_hand, product.inventory_version]),
    'a stale row must reject the complete batch without partial stock changes'
  );

  const cashier = await inviteAndLogin(app, {
    storeId, ownerHeaders: headers, email: 'bulk-count-cashier@example.com', role: 'cashier',
  });
  const denied = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`,
    headers: { ...cashier.headers, 'idempotency-key': 'bulk-count-cashier-deny-01' },
    payload: { warehouseId, items: [{ ...countPayload.items[0], expectedInventoryVersion: 2, count: '3' }] },
  });
  assert.equal(denied.statusCode, 403, denied.body);

  await app.testDb.exec(`
    CREATE FUNCTION fail_bulk_count_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'inventory.bulk_counted' THEN RAISE EXCEPTION 'injected bulk count audit failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_bulk_count_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_bulk_count_audit();
  `);
  const currentAfterCommit = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  const beforeRollbackMovementCount = await app.testDb.query(
    `SELECT COUNT(*)::int AS count FROM inventory_movements WHERE store_id = $1 AND source_type = 'bulk_stock_count'`, [storeId]
  );
  const rollback = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`,
    headers: { ...headers, 'idempotency-key': 'bulk-count-audit-rollback-01' },
    payload: { warehouseId, reason: 'Kiểm tra rollback', items: [{ productId: productA.id, expectedInventoryVersion: Number(currentAfterCommit.json().products.find((product) => product.id === productA.id).inventory_version), count: '2', sourceLine: 5 }] },
  });
  assert.equal(rollback.statusCode, 500, rollback.body);
  await app.testDb.exec('DROP TRIGGER fail_bulk_count_audit ON audit_events; DROP FUNCTION fail_bulk_count_audit();');
  const afterRollback = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${warehouseId}`, headers });
  assert.equal(afterRollback.json().products.find((product) => product.id === productA.id).on_hand, '1.250');
  const afterRollbackMovementCount = await app.testDb.query(
    `SELECT COUNT(*)::int AS count FROM inventory_movements WHERE store_id = $1 AND source_type = 'bulk_stock_count'`, [storeId]
  );
  assert.equal(afterRollbackMovementCount.rows[0].count, beforeRollbackMovementCount.rows[0].count);
  const failedAttempt = await app.testDb.query(
    `SELECT 1 FROM idempotency_records WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = 'bulk-count-audit-rollback-01'`,
    [storeId, owner.user.id]
  );
  assert.equal(failedAttempt.rowCount, 0, 'audit failure must also roll back the idempotency reservation');
});

test('sales and returned goods stay in the chosen warehouse and reconcile to store-wide stock', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'warehouse-sale-return@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng bán theo kho',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-product-0001' },
    payload: { items: [{ sku: 'SALE-LOC-1', name: 'Sản phẩm bán tại kho phụ', salePriceVnd: 10000, costVnd: 5000, openingQuantity: '5' }] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const productId = imported.json().products[0].id;
  const warehouses = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers });
  const sourceWarehouseId = warehouses.json().warehouses.find((warehouse) => warehouse.is_default).id;
  const destination = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-dest-0001' },
    payload: { code: 'SALE-BR', name: 'Kho bán hàng phụ' },
  });
  assert.equal(destination.statusCode, 201, destination.body);
  const destinationWarehouseId = destination.json().warehouse.id;
  const returnWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-return-dest-01' },
    payload: { code: 'RET-BR', name: 'Kho nhận hàng hoàn' },
  });
  assert.equal(returnWarehouse.statusCode, 201, returnWarehouse.body);
  const returnWarehouseId = returnWarehouse.json().warehouse.id;
  const transfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-transfer-01' },
    payload: { sourceWarehouseId, destinationWarehouseId, items: [{ productId, quantity: '3' }], note: 'Cấp hàng cho quầy phụ' },
  });
  assert.equal(transfer.statusCode, 201, transfer.body);
  const transferId = transfer.json().transfer.id;
  const dispatched = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-dispatch-01' }, payload: {},
  });
  assert.equal(dispatched.statusCode, 200, dispatched.body);
  const transferList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouse-transfers`, headers });
  const transferLineId = transferList.json().transfers.find((item) => item.id === transferId).lines[0].id;
  const receipt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-receive-01' },
    payload: { items: [{ transferLineId, quantity: '3' }] },
  });
  assert.equal(receipt.statusCode, 200, receipt.body);
  const beforeSaleMain = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${sourceWarehouseId}`, headers });
  const beforeSaleDestination = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(beforeSaleMain.json().products[0].on_hand, '2.000');
  assert.equal(beforeSaleDestination.json().products[0].on_hand, '3.000');

  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-submit-01' },
    payload: {
      warehouseId: destinationWarehouseId,
      items: [{ productId, quantity: 3 }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: '30000' }],
    },
  });
  assert.equal(sale.statusCode, 201, sale.body);
  const orderId = sale.json().order.id;
  const detail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().order.items[0].quantity, '3.000');
  const skuSearch = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders?q=SALE-LOC-1`, headers });
  assert.equal(skuSearch.statusCode, 200, skuSearch.body);
  assert.deepEqual(skuSearch.json().orders.map((item) => item.id), [orderId], 'order search includes a sold product SKU');
  const completedOrders = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders?status=completed`, headers });
  assert.equal(completedOrders.statusCode, 200, completedOrders.body);
  assert.deepEqual(completedOrders.json().orders.map((item) => item.id), [orderId]);
  const customerResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`, headers,
    payload: { name: 'Khách mua thiếu để kiểm tra bộ lọc' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const debtSale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-due-filter-01' },
    payload: { warehouseId: sourceWarehouseId, customerId: customerResponse.json().customer.id, items: [{ productId, quantity: 1 }], tenders: [] },
  });
  assert.equal(debtSale.statusCode, 201, debtSale.body);
  const debtOrderId = debtSale.json().order.id;
  const unpaidOrders = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders?status=due`, headers });
  assert.equal(unpaidOrders.statusCode, 200, unpaidOrders.body);
  assert.deepEqual(unpaidOrders.json().orders.map((item) => item.id), [debtOrderId], 'the receivables filter includes the unpaid order and excludes the fully paid order');
  const invalidStatus = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders?status=unknown`, headers });
  assert.equal(invalidStatus.statusCode, 400);
  const orderLocation = await app.testDb.query('SELECT warehouse_id FROM orders WHERE store_id = $1 AND id = $2', [storeId, orderId]);
  assert.equal(orderLocation.rows[0].warehouse_id, destinationWarehouseId);
  const afterSaleMain = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${sourceWarehouseId}`, headers });
  const afterSaleDestination = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${destinationWarehouseId}`, headers });
  assert.equal(afterSaleMain.json().products[0].on_hand, '1.000');
  assert.equal(afterSaleDestination.json().products[0].on_hand, '0.000');

  const archiveSource = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${destinationWarehouseId}/archive`,
    headers: { ...headers, 'idempotency-key': 'archive-sold-return-source-01' },
    payload: { reason: 'Đóng điểm bán sau khi chuyển hết hàng' },
  });
  assert.equal(archiveSource.statusCode, 200, archiveSource.body);

  const returned = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-return-0001' },
    payload: {
      items: [{ orderLineId: detail.json().order.items[0].id, quantity: 3 }],
      reason: 'Khách đổi ý', restockPolicy: 'restock', restockWarehouseId: destinationWarehouseId, refundMethod: 'bank_transfer',
    },
  });
  assert.equal(returned.statusCode, 409, returned.body);
  assert.equal(returned.json().error.code, 'warehouse_inactive');
  const returnedToActiveLocation = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: { ...headers, 'idempotency-key': 'warehouse-sale-return-0001' },
    payload: {
      items: [{ orderLineId: detail.json().order.items[0].id, quantity: 3 }],
      reason: 'Khách đổi ý', restockPolicy: 'restock', restockWarehouseId: returnWarehouseId, refundMethod: 'bank_transfer',
    },
  });
  assert.equal(returnedToActiveLocation.statusCode, 201, returnedToActiveLocation.body);
  assert.equal(returnedToActiveLocation.json().return.restockWarehouseId, returnWarehouseId);
  assert.equal(returnedToActiveLocation.json().return.restockWarehouseName, 'Kho nhận hàng hoàn');
  const afterReturnMain = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${sourceWarehouseId}`, headers });
  const afterReturnDestination = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${returnWarehouseId}`, headers });
  assert.equal(afterReturnMain.json().products[0].on_hand, '1.000');
  assert.equal(afterReturnDestination.json().products[0].on_hand, '3.000');
  const storeTotal = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(storeTotal.json().products[0].on_hand, '4.000');
  const locationMovements = await app.testDb.query(
    `SELECT warehouse_id, movement_type, quantity_delta::text AS quantity_delta FROM inventory_movements
     WHERE store_id = $1 AND source_id IN ($2, $3) ORDER BY occurred_at, id`, [storeId, orderId, returnedToActiveLocation.json().return.id]
  );
  assert.deepEqual(locationMovements.rows, [
    { warehouse_id: destinationWarehouseId, movement_type: 'sale', quantity_delta: '-3.000' },
    { warehouse_id: returnWarehouseId, movement_type: 'return', quantity_delta: '3.000' },
  ]);
  const finalOrder = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(finalOrder.json().order.returns[0].restock_warehouse_id, returnWarehouseId);
  assert.equal(finalOrder.json().order.returns[0].restock_warehouse_name, 'Kho nhận hàng hoàn');
  const returnedOrdersBySku = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders?q=SALE-LOC-1&status=returned`, headers });
  assert.equal(returnedOrdersBySku.statusCode, 200, returnedOrdersBySku.body);
  assert.deepEqual(returnedOrdersBySku.json().orders.map((item) => item.id), [orderId], 'SKU search combines with the server-side returned status filter');
  const returnAudit = await app.testDb.query(
    `SELECT metadata->>'restockWarehouseId' AS warehouse_id, metadata->>'restockWarehouseName' AS warehouse_name
     FROM audit_events WHERE store_id = $1 AND entity_type = 'return' AND entity_id = $2`,
    [storeId, returnedToActiveLocation.json().return.id]
  );
  assert.deepEqual(returnAudit.rows, [{ warehouse_id: returnWarehouseId, warehouse_name: 'Kho nhận hàng hoàn' }]);
  const returnsCsv = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/returns`, headers });
  assert.equal(returnsCsv.statusCode, 200, returnsCsv.body);
  assert.match(returnsCsv.body, /"Mã kho nhận lại"/);
  assert.match(returnsCsv.body, /"RET-BR","Kho nhận hàng hoàn"/);
});

test('unpaid order void restores stock to an active warehouse after its sale warehouse is archived', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'warehouse-void@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng hủy đơn theo kho',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-product-0001' },
    payload: { items: [{ sku: 'VOID-LOC-1', name: 'Sản phẩm hủy đơn theo kho', salePriceVnd: 10000, costVnd: 5000, openingQuantity: '3' }] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const productId = imported.json().products[0].id;
  const mainWarehouseId = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers }))
    .json().warehouses.find((warehouse) => warehouse.is_default).id;
  const saleWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-sale-wh-01' },
    payload: { code: 'VOID-SALE', name: 'Kho của đơn sẽ hủy' },
  });
  assert.equal(saleWarehouse.statusCode, 201, saleWarehouse.body);
  const saleWarehouseId = saleWarehouse.json().warehouse.id;
  const restockWarehouse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-restock-wh-01' },
    payload: { code: 'VOID-RCV', name: 'Kho nhận đơn hủy' },
  });
  assert.equal(restockWarehouse.statusCode, 201, restockWarehouse.body);
  const restockWarehouseId = restockWarehouse.json().warehouse.id;
  const transfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-transfer-0001' },
    payload: { sourceWarehouseId: mainWarehouseId, destinationWarehouseId: saleWarehouseId, items: [{ productId, quantity: '3' }] },
  });
  assert.equal(transfer.statusCode, 201, transfer.body);
  const transferId = transfer.json().transfer.id;
  const dispatched = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-dispatch-01' }, payload: {},
  });
  assert.equal(dispatched.statusCode, 200, dispatched.body);
  const transferList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouse-transfers`, headers });
  const transferLineId = transferList.json().transfers.find((item) => item.id === transferId).lines[0].id;
  const received = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-receipt-01' },
    payload: { items: [{ transferLineId, quantity: '3' }] },
  });
  assert.equal(received.statusCode, 200, received.body);

  const customer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-customer-01' },
    payload: { name: 'Khách ghi nợ', phone: '', email: '', note: '' },
  });
  assert.equal(customer.statusCode, 201, customer.body);
  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-sale-0001' },
    payload: { warehouseId: saleWarehouseId, customerId: customer.json().customer.id, items: [{ productId, quantity: 3 }], tenders: [] },
  });
  assert.equal(sale.statusCode, 201, sale.body);
  const orderId = sale.json().order.id;
  const afterSale = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${saleWarehouseId}`, headers });
  assert.equal(afterSale.json().products[0].on_hand, '0.000');

  const archived = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses/${saleWarehouseId}/archive`,
    headers: { ...headers, 'idempotency-key': 'warehouse-void-archive-sale-01' },
    payload: { reason: 'Đóng điểm bán' },
  });
  assert.equal(archived.statusCode, 200, archived.body);

  const inactiveDestinationAttempt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/void`, headers,
    payload: { reason: 'Khách chưa nhận hàng', stockConfirmed: true, warehouseId: saleWarehouseId },
  });
  assert.equal(inactiveDestinationAttempt.statusCode, 409, inactiveDestinationAttempt.body);
  assert.equal(inactiveDestinationAttempt.json().error.code, 'warehouse_inactive');

  await app.testDb.exec(`
    CREATE FUNCTION fail_sale_void_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'sale.voided' THEN RAISE EXCEPTION 'injected sale.voided audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER fail_sale_void_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_sale_void_audit();
  `);
  const auditFailure = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/void`, headers,
    payload: { reason: 'Khách chưa nhận hàng', stockConfirmed: true, warehouseId: restockWarehouseId },
  });
  assert.equal(auditFailure.statusCode, 500, auditFailure.body);
  const afterAuditFailure = await app.testDb.query(
    `SELECT o.status,
            b.on_hand::text AS restock_on_hand,
            (SELECT COALESCE(SUM(l.debit_vnd - l.credit_vnd), 0)::text
             FROM customer_ledger_entries l WHERE l.store_id = o.store_id AND l.customer_id = o.customer_id) AS customer_balance,
            (SELECT COUNT(*)::int FROM inventory_movements m WHERE m.store_id = o.store_id AND m.source_id = o.id AND m.source_type = 'order_void') AS void_movements
     FROM orders o JOIN inventory_balances b ON b.store_id = o.store_id AND b.product_id = $3 AND b.warehouse_id = $4
     WHERE o.store_id = $1 AND o.id = $2`,
    [storeId, orderId, productId, restockWarehouseId]
  );
  assert.deepEqual(afterAuditFailure.rows, [{ status: 'completed', restock_on_hand: '0.000', customer_balance: '30000', void_movements: 0 }]);
  await app.testDb.exec('DROP TRIGGER fail_sale_void_audit ON audit_events; DROP FUNCTION fail_sale_void_audit();');

  const voided = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/void`, headers,
    payload: { reason: 'Khách chưa nhận hàng', stockConfirmed: true, warehouseId: restockWarehouseId },
  });
  assert.equal(voided.statusCode, 200, voided.body);
  assert.deepEqual(voided.json(), {
    orderId, status: 'voided', alreadyVoided: false,
    restockWarehouseId, restockWarehouseName: 'Kho nhận đơn hủy',
  });

  const repeatedVoid = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/void`, headers,
    payload: { reason: 'Gửi lại sau mất kết nối', stockConfirmed: true, warehouseId: restockWarehouseId },
  });
  assert.equal(repeatedVoid.statusCode, 200, repeatedVoid.body);
  assert.deepEqual(repeatedVoid.json(), {
    orderId, status: 'voided', alreadyVoided: true,
    restockWarehouseId, restockWarehouseName: 'Kho nhận đơn hủy',
  });

  const restored = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${restockWarehouseId}`, headers });
  const archivedStock = await app.testDb.query(
    `SELECT on_hand::text AS on_hand FROM inventory_balances WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3`,
    [storeId, saleWarehouseId, productId]
  );
  assert.equal(restored.json().products[0].on_hand, '3.000');
  assert.equal(archivedStock.rows[0].on_hand, '0.000');
  const movementRows = await app.testDb.query(
    `SELECT warehouse_id, movement_type, quantity_delta::text AS quantity_delta
     FROM inventory_movements WHERE store_id = $1 AND source_id = $2 AND source_type IN ('order', 'order_void') ORDER BY movement_type`,
    [storeId, orderId]
  );
  assert.deepEqual(movementRows.rows, [
    { warehouse_id: restockWarehouseId, movement_type: 'reversal', quantity_delta: '3.000' },
    { warehouse_id: saleWarehouseId, movement_type: 'sale', quantity_delta: '-3.000' },
  ]);
  const order = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(order.json().order.voidRestockWarehouseId, restockWarehouseId);
  assert.equal(order.json().order.voidRestockWarehouseName, 'Kho nhận đơn hủy');
  const audit = await app.testDb.query(
    `SELECT metadata->>'restockWarehouseId' AS warehouse_id, metadata->>'restockWarehouseName' AS warehouse_name
     FROM audit_events WHERE store_id = $1 AND action = 'sale.voided' AND entity_id = $2`,
    [storeId, orderId]
  );
  assert.deepEqual(audit.rows, [{ warehouse_id: restockWarehouseId, warehouse_name: 'Kho nhận đơn hủy' }]);
  const customerAfterVoid = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/customers/${customer.json().customer.id}`, headers,
  });
  assert.equal(customerAfterVoid.json().customer.balance_vnd, '0');
  const ordersCsv = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/orders`, headers });
  assert.equal(ordersCsv.statusCode, 200, ordersCsv.body);
  assert.match(ordersCsv.body, /"Mã kho hoàn tồn khi hủy"/);
  assert.match(ordersCsv.body, /"VOID-RCV","Kho nhận đơn hủy"/);
});

test('product bulk updates validate final unique keys, stage swaps atomically, and replay safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'product-bulk-update@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng cập nhật hàng loạt',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'bulk-update-seed-000001' },
    payload: { items: [
      { sku: 'BULK-A', barcode: '8930000000001', name: 'Mặt hàng A', salePriceVnd: 10000, costVnd: 5000, openingQuantity: '2' },
      { sku: 'BULK-B', barcode: '8930000000002', name: 'Mặt hàng B', salePriceVnd: 12000, costVnd: 6000, openingQuantity: '3' },
    ] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const catalog = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  const productA = catalog.json().products.find((product) => product.sku === 'BULK-A');
  const productB = catalog.json().products.find((product) => product.sku === 'BULK-B');
  assert.ok(productA && productB);

  const items = [
    { productId: productA.id, version: productA.version, sourceLine: 2, sku: 'BULK-B', clearBarcode: true, costVnd: 5500 },
    { productId: productB.id, version: productB.version, sourceLine: 3, sku: 'BULK-A', barcode: '8930000000001' },
  ];
  const preview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`, headers,
    payload: { items },
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().valid, true);
  assert.equal(preview.json().changedCount, 2);
  assert.equal(preview.json().unchangedCount, 0);
  assert.deepEqual(preview.json().items[0].before, {
    sku: 'BULK-A', barcode: '8930000000001', name: 'Mặt hàng A', category: 'Chưa phân loại', unit: 'cái',
    salePriceVnd: '10000', costVnd: '5000', lowStockThreshold: '0.000',
  });
  assert.equal(preview.json().items[0].sourceLine, 2);
  assert.equal(preview.json().items[0].unchanged, false);
  const afterPreview = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  const stillBeforeWrite = afterPreview.json().products.find((product) => product.id === productA.id);
  assert.equal(stillBeforeWrite.sku, 'BULK-A');
  assert.equal(stillBeforeWrite.cost_vnd, '5000');
  assert.equal(stillBeforeWrite.version, 1);
  const unchangedPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`, headers,
    payload: { items: [{ productId: productA.id, version: 1, sourceLine: 4, category: 'Chưa phân loại' }] },
  });
  assert.equal(unchangedPreview.statusCode, 200, unchangedPreview.body);
  assert.equal(unchangedPreview.json().changedCount, 0);
  assert.equal(unchangedPreview.json().unchangedCount, 1);
  assert.equal(unchangedPreview.json().items[0].unchanged, true);
  const caseOnlyPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`, headers,
    payload: { items: [{ productId: productA.id, version: 1, sourceLine: 5, sku: 'bulk-a' }] },
  });
  assert.equal(caseOnlyPreview.statusCode, 200, caseOnlyPreview.body);
  assert.equal(caseOnlyPreview.json().changedCount, 1, 'SKU casing is visible data and should be shown as a change');

  const updateHeaders = { ...headers, 'idempotency-key': 'bulk-update-swap-000001' };
  const updated = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`, headers: updateHeaders, payload: { items },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().count, 2);
  assert.equal(updated.json().changedCount, 2);
  assert.equal(updated.json().unchangedCount, 0);

  const afterUpdate = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  const updatedA = afterUpdate.json().products.find((product) => product.id === productA.id);
  const updatedB = afterUpdate.json().products.find((product) => product.id === productB.id);
  assert.equal(updatedA.sku, 'BULK-B');
  assert.equal(updatedA.barcode, null);
  assert.equal(updatedA.cost_vnd, '5500');
  assert.equal(updatedA.version, 2);
  assert.equal(updatedB.sku, 'BULK-A');
  assert.equal(updatedB.barcode, '8930000000001');
  assert.equal(updatedB.version, 2);

  const stalePreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`, headers,
    payload: { items },
  });
  assert.equal(stalePreview.statusCode, 200, stalePreview.body);
  assert.equal(stalePreview.json().valid, false);
  assert.match(stalePreview.json().conflict, /Dòng 2: sản phẩm đã thay đổi/);
  assert.deepEqual(stalePreview.json().items, []);

  const replay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`, headers: updateHeaders, payload: { items },
  });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(replay.json(), updated.json());

  const changedReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`, headers: updateHeaders,
    payload: { items: [{ ...items[0], costVnd: 5700 }] },
  });
  assert.equal(changedReplay.statusCode, 409, changedReplay.body);
  assert.equal(changedReplay.json().error.code, 'idempotency_conflict');

  const stale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { ...headers, 'idempotency-key': 'bulk-update-stale-0001' },
    payload: { items: [{ productId: productA.id, version: 1, sku: 'STALE-SKU' }] },
  });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().error.code, 'version_conflict');

  const unchanged = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { ...headers, 'idempotency-key': 'bulk-update-noop-000001' },
    payload: { items: [{ productId: productA.id, version: 2, clearBarcode: true }] },
  });
  assert.equal(unchanged.statusCode, 200, unchanged.body);
  assert.equal(unchanged.json().changedCount, 0);
  assert.equal(unchanged.json().unchangedCount, 1);

  const conflicting = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { ...headers, 'idempotency-key': 'bulk-update-conflict-01' },
    payload: { items: [{ productId: productA.id, version: 2, sku: 'BULK-A' }] },
  });
  assert.equal(conflicting.statusCode, 409, conflicting.body);
  assert.equal(conflicting.json().error.code, 'product_conflict');

  const invalidClear = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { ...headers, 'idempotency-key': 'bulk-update-bad-clear-01' },
    payload: { items: [{ productId: productA.id, version: 2, barcode: '8930000000003', clearBarcode: true }] },
  });
  assert.equal(invalidClear.statusCode, 400, invalidClear.body);

  const outsider = await registerAndLogin(app, {
    email: 'product-bulk-outsider@example.com', displayName: 'Chủ khác', storeName: 'Cửa hàng khác',
  });
  const crossTenant = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { cookie: cookieHeader(outsider.cookies), origin, 'x-csrf-token': outsider.cookies.slink_csrf, 'idempotency-key': 'bulk-update-cross-store-01' },
    payload: { items: [{ productId: productA.id, version: 2, costVnd: 5600 }] },
  });
  assert.equal(crossTenant.statusCode, 403, crossTenant.body);
  const crossTenantPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`,
    headers: { cookie: cookieHeader(outsider.cookies), origin, 'x-csrf-token': outsider.cookies.slink_csrf },
    payload: { items: [{ productId: productA.id, version: 2, costVnd: 5600 }] },
  });
  assert.equal(crossTenantPreview.statusCode, 403, crossTenantPreview.body);

  const cashier = await inviteAndLogin(app, {
    storeId, ownerHeaders: headers, email: 'product-bulk-cashier@example.com', role: 'cashier',
  });
  const roleDenied = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`,
    headers: { ...cashier.headers, 'idempotency-key': 'bulk-update-cashier-deny' },
    payload: { items: [{ productId: productA.id, version: 2, costVnd: 5600 }] },
  });
  assert.equal(roleDenied.statusCode, 403, roleDenied.body);
  const previewRoleDenied = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update/preview`,
    headers: cashier.headers,
    payload: { items: [{ productId: productA.id, version: 2, costVnd: 5600 }] },
  });
  assert.equal(previewRoleDenied.statusCode, 403, previewRoleDenied.body);

  await app.testDb.exec(`
    CREATE FUNCTION fail_product_bulk_update_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'product.bulk_updated' THEN RAISE EXCEPTION 'injected product.bulk_updated audit failure'; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_product_bulk_update_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_product_bulk_update_audit();
  `);
  const rollbackItems = [{ productId: productB.id, version: 2, sourceLine: 2, sku: 'ROLLBACK-SKU', barcode: '8930000000002' }];
  const rollbackHeaders = { ...headers, 'idempotency-key': 'bulk-update-rollback-01' };
  const failed = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`, headers: rollbackHeaders, payload: { items: rollbackItems },
  });
  assert.equal(failed.statusCode, 500, failed.body);
  const afterRollback = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  const rolledBackProduct = afterRollback.json().products.find((product) => product.id === productB.id);
  assert.equal(rolledBackProduct.sku, 'BULK-A');
  assert.equal(rolledBackProduct.barcode, '8930000000001');
  assert.equal(rolledBackProduct.version, 2);
  await app.testDb.exec('DROP TRIGGER fail_product_bulk_update_audit ON audit_events; DROP FUNCTION fail_product_bulk_update_audit();');

  const retry = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/bulk-update`, headers: rollbackHeaders, payload: { items: rollbackItems },
  });
  assert.equal(retry.statusCode, 200, retry.body);
  assert.equal(retry.json().changedCount, 1);
  const history = await app.testDb.query(
    `SELECT
       (SELECT count(*)::int FROM product_cost_history WHERE store_id = $1 AND product_id = $2) AS costs,
       (SELECT count(*)::int FROM audit_events WHERE store_id = $1 AND action = 'product.bulk_updated') AS audits`,
    [storeId, productA.id]
  );
  assert.deepEqual(history.rows[0], { costs: 2, audits: 3 });
});

test('cash outflow cannot exceed the drawer balance and a rejected request can be retried safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'cash-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng quỹ tiền mặt',
  });
  const storeId = owner.store.id;
  const headers = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };

  const opened = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...headers, 'idempotency-key': 'cash-session-open-0001' },
    payload: { openingFloatVnd: '10000' },
  });
  assert.equal(opened.statusCode, 201, opened.body);
  const sessionId = opened.json().session.id;

  const outflow = {
    direction: 'out',
    amountVnd: '10001',
    method: 'cash',
    category: 'Chi phí vận hành',
    note: 'Khoản chi cần được quỹ hỗ trợ',
  };
  const outflowHeaders = { ...headers, 'idempotency-key': 'cash-manual-out-0001' };
  const rejected = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: outflowHeaders, payload: outflow,
  });
  assert.equal(rejected.statusCode, 409, rejected.body);
  assert.equal(rejected.json().error.code, 'cash_balance_insufficient');

  const afterRejection = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers });
  assert.equal(afterRejection.statusCode, 200, afterRejection.body);
  assert.equal(afterRejection.json().session.id, sessionId);
  assert.equal(afterRejection.json().session.cashOutVnd, '0');
  assert.equal(afterRejection.json().session.expectedCashVnd, '10000');

  const inflow = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...headers, 'idempotency-key': 'cash-manual-in-0001' },
    payload: {
      direction: 'in', amountVnd: '1', method: 'cash', category: 'Bổ sung quỹ', note: 'Tiền quỹ được bổ sung',
    },
  });
  assert.equal(inflow.statusCode, 201, inflow.body);

  const accepted = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: outflowHeaders, payload: outflow,
  });
  assert.equal(accepted.statusCode, 201, accepted.body);

  const replay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: outflowHeaders, payload: outflow,
  });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.json().movement.id, accepted.json().movement.id);

  const finalState = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers });
  assert.equal(finalState.statusCode, 200, finalState.body);
  assert.equal(finalState.json().session.cashInVnd, '1');
  assert.equal(finalState.json().session.cashOutVnd, '10001');
  assert.equal(finalState.json().session.expectedCashVnd, '0');
});

test('customer CSV onboarding previews without writes and commits contacts/opening balances atomically', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'customer-import-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng nhập khách',
  });
  const { id: storeId } = owner.store;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const items = [
    { sourceLine: 2, name: 'Khách nhập A', phone: '090 111 2233', email: 'a@example.test', openingBalanceVnd: '1250', note: 'Khách lâu năm' },
    { sourceLine: 3, name: 'Khách nhập B', phone: '0901112244', email: 'b@example.test', openingBalanceVnd: '0', note: '' },
  ];
  const previewUrl = `/api/stores/${storeId}/customers/import/preview`;
  const importUrl = `/api/stores/${storeId}/customers/import`;
  const preview = await app.inject({ method: 'POST', url: previewUrl, headers, payload: { items } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual(preview.json(), { valid: true, count: 2, openingBalanceTotalVnd: '1250', conflict: null });
  const beforeCommit = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers });
  assert.equal(beforeCommit.statusCode, 200, beforeCommit.body);
  assert.equal(beforeCommit.json().total, 0, 'preview does not create customer records');
  const previewCounts = await app.testDb.query(
    `SELECT (SELECT COUNT(*)::int FROM customer_ledger_entries WHERE store_id = $1) AS ledger,
            (SELECT COUNT(*)::int FROM audit_events WHERE store_id = $1 AND action = 'customers.imported') AS imports`,
    [storeId]
  );
  assert.deepEqual(previewCounts.rows[0], { ledger: 0, imports: 0 });

  const key = 'customer-import-atomic-0001';
  await app.testDb.exec(`
    CREATE FUNCTION fail_customer_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'customer.opening_balance_recorded' THEN RAISE EXCEPTION 'injected opening-balance audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER fail_customer_import_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_customer_import_audit();
  `);
  const failed = await app.inject({ method: 'POST', url: importUrl, headers: { ...headers, 'idempotency-key': key }, payload: { items } });
  assert.equal(failed.statusCode, 500, failed.body);
  const rollback = await app.testDb.query(
    `SELECT (SELECT COUNT(*)::int FROM customers WHERE store_id = $1) AS customers,
            (SELECT COUNT(*)::int FROM customer_ledger_entries WHERE store_id = $1) AS ledger,
            (SELECT COUNT(*)::int FROM audit_events WHERE store_id = $1 AND action = 'customers.imported') AS imports,
            (SELECT COUNT(*)::int FROM idempotency_records WHERE store_id = $1 AND idempotency_key = $2) AS requests`,
    [storeId, key]
  );
  assert.deepEqual(rollback.rows[0], { customers: 0, ledger: 0, imports: 0, requests: 0 });
  await app.testDb.exec('DROP TRIGGER fail_customer_import_audit ON audit_events; DROP FUNCTION fail_customer_import_audit();');

  const imported = await app.inject({ method: 'POST', url: importUrl, headers: { ...headers, 'idempotency-key': key }, payload: { items } });
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.json().count, 2);
  assert.equal(imported.json().openingBalanceTotalVnd, '1250');
  const replay = await app.inject({ method: 'POST', url: importUrl, headers: { ...headers, 'idempotency-key': key }, payload: { items } });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.json().importId, imported.json().importId);
  assert.equal(replay.json().customers.length, 2);

  const stored = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers });
  assert.equal(stored.json().total, 2);
  assert.equal(stored.json().customers.find((row) => row.phone === '090 111 2233').balance_vnd, '1250');
  const ledgers = await app.testDb.query(
    `SELECT COUNT(*)::int AS count, SUM(debit_vnd)::text AS debit
     FROM customer_ledger_entries WHERE store_id = $1`, [storeId]
  );
  assert.deepEqual(ledgers.rows[0], { count: 1, debit: '1250' });
  const importAudit = await app.testDb.query(
    `SELECT COUNT(*)::int AS count FROM audit_events WHERE store_id = $1 AND action = 'customers.imported'`, [storeId]
  );
  assert.equal(importAudit.rows[0].count, 1);

  const activeDuplicate = [{ sourceLine: 2, name: 'Khách bị trùng', phone: '0901112233', email: '', openingBalanceVnd: '0', note: '' }];
  const duplicatePreview = await app.inject({ method: 'POST', url: previewUrl, headers, payload: { items: activeDuplicate } });
  assert.equal(duplicatePreview.statusCode, 200, duplicatePreview.body);
  assert.equal(duplicatePreview.json().valid, false);
  assert.match(duplicatePreview.json().conflict, /Dòng 2/);
  const duplicateCommit = await app.inject({
    method: 'POST', url: importUrl, headers: { ...headers, 'idempotency-key': 'customer-import-duplicate-01' }, payload: { items: activeDuplicate },
  });
  assert.equal(duplicateCommit.statusCode, 409, duplicateCommit.body);
  assert.equal(duplicateCommit.json().error.code, 'customer_import_conflict');
  assert.equal((await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers })).json().total, 2);

  const duplicateRows = await app.inject({
    method: 'POST', url: previewUrl, headers,
    payload: { items: [items[0], { ...items[1], sourceLine: 9, phone: '0901112233' }] },
  });
  assert.equal(duplicateRows.statusCode, 400, duplicateRows.body);
  assert.equal(duplicateRows.json().error.code, 'customer_import_duplicate');

  const cashier = await inviteAndLogin(app, {
    storeId, ownerHeaders: headers, email: 'customer-import-cashier@example.com', role: 'cashier',
  });
  const cashierPreview = await app.inject({ method: 'POST', url: previewUrl, headers: cashier.headers, payload: { items: activeDuplicate } });
  assert.equal(cashierPreview.statusCode, 403, cashierPreview.body);
  const cashierImport = await app.inject({
    method: 'POST', url: importUrl, headers: { ...cashier.headers, 'idempotency-key': 'cashier-customer-import-01' }, payload: { items: activeDuplicate },
  });
  assert.equal(cashierImport.statusCode, 403, cashierImport.body);
  assert.equal((await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers })).json().total, 2);
});

test('customer debt collection allocates across order and opening balances once', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'customer-payment@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng thu công nợ khách',
  });
  const storeId = owner.store.id;
  const headers = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };

  const customerResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`,
    headers: { ...headers, 'idempotency-key': 'customer-opening-debt-0001' },
    payload: { name: 'Khách còn nợ', phone: '0900000011', openingBalanceVnd: '3000' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);
  const customerId = customerResponse.json().customer.id;

  const productResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'customer-payment-product-0001' },
    payload: { items: [{ sku: 'CUSTOMER-DEBT-1', name: 'Sản phẩm ghi nợ', salePriceVnd: 10000, costVnd: 4000, openingQuantity: '1' }] },
  });
  assert.equal(productResponse.statusCode, 201, productResponse.body);
  const productId = productResponse.json().products[0].id;

  const opened = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...headers, 'idempotency-key': 'customer-payment-session-0001' },
    payload: { openingFloatVnd: '10000' },
  });
  assert.equal(opened.statusCode, 201, opened.body);

  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'customer-payment-sale-0001' },
    payload: {
      customerId,
      items: [{ productId, quantity: 1 }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: '5000' }],
    },
  });
  assert.equal(sale.statusCode, 201, sale.body);
  assert.equal(sale.json().order.dueVnd, '5000');

  const paymentPayload = { amountVnd: '6000', method: 'cash', note: 'Thu công nợ theo hồ sơ khách' };
  const paymentHeaders = { ...headers, 'idempotency-key': 'customer-payment-receipt-0001' };
  const paymentUrl = `/api/stores/${storeId}/customers/${customerId}/payments`;
  const payment = await app.inject({ method: 'POST', url: paymentUrl, headers: paymentHeaders, payload: paymentPayload });
  assert.equal(payment.statusCode, 201, payment.body);
  assert.equal(payment.json().payment.amountVnd, '6000');
  assert.equal(payment.json().payment.customerBalanceVnd, '2000');
  assert.equal(payment.json().payment.allocations.length, 1);
  assert.equal(payment.json().payment.allocations[0].orderId, sale.json().order.id);
  assert.equal(payment.json().payment.allocations[0].amountVnd, '5000');

  const replay = await app.inject({ method: 'POST', url: paymentUrl, headers: paymentHeaders, payload: paymentPayload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.json().payment.id, payment.json().payment.id);
  const conflict = await app.inject({
    method: 'POST', url: paymentUrl, headers: paymentHeaders,
    payload: { ...paymentPayload, amountVnd: '6001' },
  });
  assert.equal(conflict.statusCode, 409, conflict.body);
  assert.equal(conflict.json().error.code, 'idempotency_conflict');

  const customerDetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers/${customerId}`, headers });
  assert.equal(customerDetail.statusCode, 200, customerDetail.body);
  assert.equal(customerDetail.json().customer.balance_vnd, '2000');
  assert.equal(customerDetail.json().recentPayments.length, 1);
  assert.equal(customerDetail.json().recentPayments[0].id, payment.json().payment.id);
  assert.equal(customerDetail.json().recentPayments[0].amount_vnd, '6000');
  assert.equal(customerDetail.json().recentPayments[0].allocations[0].amountVnd, '5000');
  assert.equal(customerDetail.json().recentPayments[0].opening_balance_amount_vnd, '1000');
  const orderDetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${sale.json().order.id}`, headers });
  assert.equal(orderDetail.statusCode, 200, orderDetail.body);
  assert.equal(orderDetail.json().order.payments.reduce((sum, row) => sum + Number(row.amount_vnd), 0), 10000);

  const overpayment = await app.inject({
    method: 'POST', url: paymentUrl, headers: { ...headers, 'idempotency-key': 'customer-payment-too-much-001' },
    payload: { amountVnd: '2001', method: 'cash', note: 'Không được vượt công nợ' },
  });
  assert.equal(overpayment.statusCode, 409, overpayment.body);
  assert.equal(overpayment.json().error.code, 'payment_exceeds_due');

  const concurrentReceipts = await Promise.all([
    app.inject({
      method: 'POST', url: paymentUrl, headers: { ...headers, 'idempotency-key': 'customer-payment-race-a-001' },
      payload: { amountVnd: '1500', method: 'bank_transfer', note: 'Thu đồng thời A' },
    }),
    app.inject({
      method: 'POST', url: paymentUrl, headers: { ...headers, 'idempotency-key': 'customer-payment-race-b-001' },
      payload: { amountVnd: '1500', method: 'bank_transfer', note: 'Thu đồng thời B' },
    }),
  ]);
  assert.deepEqual(concurrentReceipts.map((response) => response.statusCode).sort(), [201, 409]);
  assert.equal(concurrentReceipts.find((response) => response.statusCode === 409).json().error.code, 'payment_exceeds_due');
  const remainder = await app.inject({
    method: 'POST', url: paymentUrl, headers: { ...headers, 'idempotency-key': 'customer-payment-final-0001' },
    payload: { amountVnd: '500', method: 'bank_transfer', note: 'Thu nốt công nợ đầu kỳ' },
  });
  assert.equal(remainder.statusCode, 201, remainder.body);
  assert.equal(remainder.json().payment.customerBalanceVnd, '0');
  const settledCustomer = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers/${customerId}`, headers });
  assert.equal(settledCustomer.statusCode, 200, settledCustomer.body);
  assert.equal(settledCustomer.json().customer.balance_vnd, '0');
  assert.equal(settledCustomer.json().recentPayments.length, 3);
  assert.deepEqual(settledCustomer.json().recentPayments.map((row) => row.amount_vnd).sort(), ['1500', '500', '6000']);

  const finance = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(finance.statusCode, 200, finance.body);
  assert.equal(finance.json().summary.customerDebtVnd, '0');
  const receiptMovement = finance.json().movements.find((row) => row.source_type === 'customer_payment'
    && row.source_id === payment.json().payment.id);
  assert.ok(receiptMovement, 'one customer receipt is present in the cashbook');
  assert.equal(receiptMovement.amount_vnd, '6000');
  assert.equal(receiptMovement.cash_session_id, opened.json().session.id);

  const closeSession = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers });
  assert.equal(closeSession.json().session.expectedCashVnd, '16000');
});

test('supplier payments, cash purchases, and return refunds preserve ledgers when the drawer is short', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'cash-workflows@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng kiểm tra giao dịch tiền mặt',
  });
  const storeId = owner.store.id;
  const headers = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };

  const supplierResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers`,
    headers: { ...headers, 'idempotency-key': 'cash-supplier-create-001' },
    payload: { name: 'Nhà cung cấp kiểm tra', openingPayableVnd: '1' },
  });
  assert.equal(supplierResponse.statusCode, 201, supplierResponse.body);
  const supplierId = supplierResponse.json().supplier.id;

  const productImport = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'cash-product-import-0001' },
    payload: { items: [{ sku: 'CASH-TEST-1', name: 'Sản phẩm kiểm tra quỹ', salePriceVnd: 1, costVnd: 0, openingQuantity: '1' }] },
  });
  assert.equal(productImport.statusCode, 201, productImport.body);
  const productId = productImport.json().products[0].id;

  const opened = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...headers, 'idempotency-key': 'cash-session-open-0002' },
    payload: { openingFloatVnd: '0' },
  });
  assert.equal(opened.statusCode, 201, opened.body);

  const supplierPayment = {
    amountVnd: '1', method: 'cash', note: 'Thanh toán thử',
  };
  const supplierPaymentHeaders = { ...headers, 'idempotency-key': 'cash-supplier-payment-01' };
  const rejectedSupplierPayment = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers/${supplierId}/payments`,
    headers: supplierPaymentHeaders, payload: supplierPayment,
  });
  assert.equal(rejectedSupplierPayment.statusCode, 409, rejectedSupplierPayment.body);
  assert.equal(rejectedSupplierPayment.json().error.code, 'cash_balance_insufficient');

  const openedAfterReject = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers });
  assert.equal(openedAfterReject.json().session.expectedCashVnd, '0');
  const supplierBeforeRetry = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(supplierBeforeRetry.json().suppliers.find((item) => item.id === supplierId).balance_vnd, '1');

  const supplierPaymentCashIn = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...headers, 'idempotency-key': 'cash-supplier-inflow-001' },
    payload: { direction: 'in', amountVnd: '1', method: 'cash', category: 'Bổ sung quỹ', note: 'Nạp quỹ' },
  });
  assert.equal(supplierPaymentCashIn.statusCode, 201, supplierPaymentCashIn.body);
  const acceptedSupplierPayment = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers/${supplierId}/payments`,
    headers: supplierPaymentHeaders, payload: supplierPayment,
  });
  assert.equal(acceptedSupplierPayment.statusCode, 201, acceptedSupplierPayment.body);
  const supplierAfterRetry = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(supplierAfterRetry.json().suppliers.find((item) => item.id === supplierId).balance_vnd, '0');

  const purchase = {
    productId, quantity: '1', unitCostVnd: '1', amountPaidVnd: '1', method: 'cash',
  };
  const purchaseHeaders = { ...headers, 'idempotency-key': 'cash-paid-purchase-001' };
  const rejectedPurchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`, headers: purchaseHeaders, payload: purchase,
  });
  assert.equal(rejectedPurchase.statusCode, 409, rejectedPurchase.body);
  assert.equal(rejectedPurchase.json().error.code, 'cash_balance_insufficient');
  const productBeforeRetry = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(productBeforeRetry.json().products.find((item) => item.id === productId).on_hand, '1.000');
  const purchasesBeforeRetry = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers });
  assert.equal(purchasesBeforeRetry.json().purchases.length, 0);

  const purchaseCashIn = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...headers, 'idempotency-key': 'cash-purchase-inflow-001' },
    payload: { direction: 'in', amountVnd: '1', method: 'cash', category: 'Bổ sung quỹ', note: 'Nạp quỹ' },
  });
  assert.equal(purchaseCashIn.statusCode, 201, purchaseCashIn.body);
  const acceptedPurchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`, headers: purchaseHeaders, payload: purchase,
  });
  assert.equal(acceptedPurchase.statusCode, 201, acceptedPurchase.body);

  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`,
    headers: { ...headers, 'idempotency-key': 'cash-return-sale-0001' },
    payload: { items: [{ productId, quantity: 1 }], amountReceivedVnd: '1', method: 'cash' },
  });
  assert.equal(sale.statusCode, 201, sale.body);
  const orderId = sale.json().order.id;
  const orderDetails = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  const orderLineId = orderDetails.json().order.items[0].id;

  const emptyTheDrawer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...headers, 'idempotency-key': 'cash-drain-before-return' },
    payload: { direction: 'out', amountVnd: '1', method: 'cash', category: 'Chi phí vận hành', note: 'Chi hết tiền lẻ' },
  });
  assert.equal(emptyTheDrawer.statusCode, 201, emptyTheDrawer.body);

  const returnPayload = {
    items: [{ orderLineId, quantity: 1 }],
    reason: 'Khách trả sản phẩm', refundMethod: 'cash', restockPolicy: 'restock',
  };
  const returnHeaders = { ...headers, 'idempotency-key': 'cash-return-refund-001' };
  const rejectedRefund = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: returnHeaders, payload: returnPayload,
  });
  assert.equal(rejectedRefund.statusCode, 409, rejectedRefund.body);
  assert.equal(rejectedRefund.json().error.code, 'cash_balance_insufficient');

  const stateAfterRefundReject = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(stateAfterRefundReject.json().order.status, 'completed');
  assert.equal(stateAfterRefundReject.json().order.items[0].returned_quantity, '0');
  const stockAfterRefundReject = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers });
  assert.equal(stockAfterRefundReject.json().products.find((item) => item.id === productId).on_hand, '1.000');

  const refundCashIn = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...headers, 'idempotency-key': 'cash-refund-inflow-001' },
    payload: { direction: 'in', amountVnd: '1', method: 'cash', category: 'Bổ sung quỹ', note: 'Nạp quỹ' },
  });
  assert.equal(refundCashIn.statusCode, 201, refundCashIn.body);
  const acceptedRefund = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/orders/${orderId}/returns`,
    headers: returnHeaders, payload: returnPayload,
  });
  assert.equal(acceptedRefund.statusCode, 201, acceptedRefund.body);
  const returnedOrder = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(returnedOrder.json().order.status, 'returned');
  assert.equal(returnedOrder.json().order.items[0].returned_quantity, '1.000');
  const finalRegister = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers });
  assert.equal(finalRegister.json().session.expectedCashVnd, '0');
});

test('cashier finance access is limited to the active shift and cannot change owner-only cash records', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'role-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng kiểm tra quyền',
  });
  const storeId = owner.store.id;
  const ownerHeaders = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };

  const productImport = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...ownerHeaders, 'idempotency-key': 'role-product-import-0001' },
    payload: { items: [{ sku: 'ROLE-1', name: 'Sản phẩm phân quyền', salePriceVnd: 1000, costVnd: 250, openingQuantity: '2' }] },
  });
  assert.equal(productImport.statusCode, 201, productImport.body);

  const supplierResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'role-supplier-create-001' },
    payload: { name: 'Nhà cung cấp riêng', openingPayableVnd: '1000' },
  });
  assert.equal(supplierResponse.statusCode, 201, supplierResponse.body);
  const supplierId = supplierResponse.json().supplier.id;

  const opened = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': 'role-cash-session-open-1' },
    payload: { openingFloatVnd: '5000' },
  });
  assert.equal(opened.statusCode, 201, opened.body);
  const sessionId = opened.json().session.id;
  const cashIn = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...ownerHeaders, 'idempotency-key': 'role-cashbook-in-0001' },
    payload: { direction: 'in', amountVnd: '100', method: 'cash', category: 'Thu bổ sung', note: 'Nghiệm thu quyền xem' },
  });
  assert.equal(cashIn.statusCode, 201, cashIn.body);

  const cashier = await inviteAndLogin(app, {
    storeId, ownerHeaders, email: 'cashier-role@example.com', role: 'cashier',
  });
  const cashierHeaders = cashier.headers;

  const finance = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers: cashierHeaders });
  assert.equal(finance.statusCode, 200, finance.body);
  assert.deepEqual(finance.json().financeAccess, { full: false, cashbook: true, purchases: false });
  assert.equal(finance.json().summary, null);
  assert.equal(finance.json().suppliers.length, 0);
  assert.equal(finance.json().customerDebtors.length, 0);
  assert.equal(finance.json().purchases.length, 0);
  assert.equal(finance.json().movements.length, 1);
  assert.equal(finance.json().movements[0].amount_vnd, '100');

  const products = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers: cashierHeaders });
  assert.equal(products.statusCode, 200, products.body);
  assert.equal(products.json().products[0].cost_vnd, null);

  const register = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: cashierHeaders });
  assert.equal(register.statusCode, 200, register.body);
  assert.equal(register.json().session.expectedCashVnd, '5100');
  assert.equal(register.json().canClose, false);

  const closeAttempt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/${sessionId}/close`,
    headers: { ...cashierHeaders, 'idempotency-key': 'role-cash-session-close-1' },
    payload: { countedCashVnd: '5100', note: '' },
  });
  assert.equal(closeAttempt.statusCode, 403, closeAttempt.body);

  const cashbookAttempt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...cashierHeaders, 'idempotency-key': 'role-cashbook-out-0001' },
    payload: { direction: 'out', amountVnd: '1', method: 'cash', category: 'Chi phí', note: 'Không được phép' },
  });
  assert.equal(cashbookAttempt.statusCode, 403, cashbookAttempt.body);

  const supplierPaymentAttempt = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers/${supplierId}/payments`,
    headers: { ...cashierHeaders, 'idempotency-key': 'role-supplier-payment-01' },
    payload: { amountVnd: '1', method: 'cash', note: 'Không được phép' },
  });
  assert.equal(supplierPaymentAttempt.statusCode, 403, supplierPaymentAttempt.body);

  const analytics = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=7`, headers: cashierHeaders });
  assert.equal(analytics.statusCode, 403, analytics.body);
});

test('manager, accountant, and stockkeeper receive different finance and record access', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'role-matrix-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng ma trận quyền',
  });
  const storeId = owner.store.id;
  const ownerHeaders = {
    cookie: cookieHeader(owner.cookies),
    origin,
    'x-csrf-token': owner.cookies.slink_csrf,
  };

  const productImport = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-product-import-01' },
    payload: { items: [{ sku: 'MATRIX-1', name: 'Sản phẩm quyền hạn', salePriceVnd: 500, costVnd: 250, openingQuantity: '2' }] },
  });
  assert.equal(productImport.statusCode, 201, productImport.body);
  const productId = productImport.json().products[0].id;

  const supplierResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-supplier-create-01' },
    payload: { name: 'Nhà cung cấp quyền hạn', openingPayableVnd: '1000' },
  });
  assert.equal(supplierResponse.statusCode, 201, supplierResponse.body);

  const customerResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-customer-create-01' },
    payload: { name: 'Khách hàng quyền hạn', openingBalanceVnd: '300' },
  });
  assert.equal(customerResponse.statusCode, 201, customerResponse.body);

  const opened = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-cash-session-open-01' },
    payload: { openingFloatVnd: '5000' },
  });
  assert.equal(opened.statusCode, 201, opened.body);

  const cashIn = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-cashbook-in-01' },
    payload: { direction: 'in', amountVnd: '100', method: 'cash', category: 'Thu bổ sung', note: 'Số liệu phân quyền' },
  });
  assert.equal(cashIn.statusCode, 201, cashIn.body);

  const purchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': 'matrix-purchase-create-01' },
    payload: {
      productId, quantity: 1, unitCostVnd: '250', amountPaidVnd: '0',
      method: 'cash', supplierName: 'Nhà cung cấp quyền hạn', note: 'Phiếu nhập để xem theo vai trò',
    },
  });
  assert.equal(purchase.statusCode, 201, purchase.body);

  const manager = await inviteAndLogin(app, {
    storeId, ownerHeaders, email: 'matrix-manager@example.com', role: 'manager',
  });
  const accountant = await inviteAndLogin(app, {
    storeId, ownerHeaders, email: 'matrix-accountant@example.com', role: 'accountant',
  });
  const stockkeeper = await inviteAndLogin(app, {
    storeId, ownerHeaders, email: 'matrix-stockkeeper@example.com', role: 'stockkeeper',
  });

  for (const staff of [manager, accountant]) {
    const finance = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers: staff.headers });
    assert.equal(finance.statusCode, 200, finance.body);
    assert.deepEqual(finance.json().financeAccess, { full: true, cashbook: true, purchases: true });
    assert.equal(finance.json().summary.supplierPayableVnd, '1250');
    assert.equal(finance.json().summary.customerDebtVnd, '300');
    assert.equal(finance.json().suppliers[0].balance_vnd, '1250');
    assert.equal(finance.json().customerDebtors[0].balance_vnd, '300');
    assert.equal(finance.json().movements.length, 1);
    assert.equal(finance.json().purchases.length, 1);

    const analytics = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=7`, headers: staff.headers });
    assert.equal(analytics.statusCode, 200, analytics.body);
    assert.equal(analytics.json().summary.averageTicketVnd, '0', 'an empty report must return integer VND for the average');
    const productList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers: staff.headers });
    assert.equal(productList.json().products.find((item) => item.id === productId).cost_vnd, '250');
    const customers = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers: staff.headers });
    assert.equal(customers.statusCode, 200, customers.body);
    const orders = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders`, headers: staff.headers });
    assert.equal(orders.statusCode, 200, orders.body);

    const register = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: staff.headers });
    assert.equal(register.statusCode, 200, register.body);
    assert.equal(register.json().canClose, staff === manager);
  }

  const stockFinance = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers: stockkeeper.headers });
  assert.equal(stockFinance.statusCode, 200, stockFinance.body);
  assert.deepEqual(stockFinance.json().financeAccess, { full: false, cashbook: false, purchases: true });
  assert.equal(stockFinance.json().summary, null);
  assert.equal(stockFinance.json().movements.length, 0);
  assert.equal(stockFinance.json().customerDebtors.length, 0);
  assert.equal(stockFinance.json().suppliers.length, 1);
  assert.equal(stockFinance.json().suppliers[0].name, 'Nhà cung cấp quyền hạn');
  assert.equal(Object.hasOwn(stockFinance.json().suppliers[0], 'balance_vnd'), false);
  assert.equal(stockFinance.json().purchases.length, 1);
  assert.equal(stockFinance.json().purchases[0].supplier_name, 'Nhà cung cấp quyền hạn');

  const stockkeeperProducts = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers: stockkeeper.headers });
  assert.equal(stockkeeperProducts.json().products.find((item) => item.id === productId).cost_vnd, '250');
  const stockkeeperCustomers = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers`, headers: stockkeeper.headers });
  assert.equal(stockkeeperCustomers.statusCode, 403, stockkeeperCustomers.body);
  const stockkeeperOrders = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders`, headers: stockkeeper.headers });
  assert.equal(stockkeeperOrders.statusCode, 403, stockkeeperOrders.body);
  const stockkeeperAnalytics = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=7`, headers: stockkeeper.headers });
  assert.equal(stockkeeperAnalytics.statusCode, 403, stockkeeperAnalytics.body);
  const stockkeeperRegister = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: stockkeeper.headers });
  assert.equal(stockkeeperRegister.statusCode, 403, stockkeeperRegister.body);
});

test('selected stockkeeper warehouse scopes cover inventory, transfers, purchases, orders, and exports', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'warehouse-scope-owner@example.com', displayName: 'Chủ kho', storeName: 'Cửa hàng giới hạn kho',
  });
  const storeId = owner.store.id;
  const ownerHeaders = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const productResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-product-import-01' },
    payload: { items: [{ sku: 'SCOPE-1', name: 'Hàng có tồn ở kho chính', salePriceVnd: 1000, costVnd: 500, openingQuantity: '6' }] },
  });
  assert.equal(productResponse.statusCode, 201, productResponse.body);
  const productId = productResponse.json().products[0].id;
  const supplierResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/suppliers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-supplier-create-01' },
    payload: { name: 'Nhà cung cấp dùng để kiểm tra phạm vi' },
  });
  assert.equal(supplierResponse.statusCode, 201, supplierResponse.body);
  const supplierId = supplierResponse.json().supplier.id;
  const mainWarehouseId = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: ownerHeaders }))
    .json().warehouses.find((warehouse) => warehouse.is_default).id;
  const secondaryResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouses`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-warehouse-create-01' },
    payload: { code: 'SCOPE-02', name: 'Kho được giao' },
  });
  assert.equal(secondaryResponse.statusCode, 201, secondaryResponse.body);
  const secondaryWarehouseId = secondaryResponse.json().warehouse.id;

  const mainPurchaseOrder = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-owner-po-main-0001' },
    payload: { supplierId, warehouseId: mainWarehouseId, items: [{ productId, quantity: '2', unitCostVnd: '500' }] },
  });
  assert.equal(mainPurchaseOrder.statusCode, 201, mainPurchaseOrder.body);
  const mainPurchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-owner-purchase-01' },
    payload: { productId, quantity: 1, unitCostVnd: '500', amountPaidVnd: '0', supplierName: 'Nhà cung cấp dùng để kiểm tra phạm vi' },
  });
  assert.equal(mainPurchase.statusCode, 201, mainPurchase.body);

  const stockkeeper = await inviteAndLogin(app, {
    storeId, ownerHeaders, email: 'warehouse-scope-stockkeeper@example.com', role: 'stockkeeper',
  });
  const emptyScope = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${stockkeeper.user.id}`,
    headers: ownerHeaders,
    payload: { role: 'stockkeeper', status: 'active', warehouseScopeMode: 'selected', warehouseIds: [] },
  });
  assert.equal(emptyScope.statusCode, 400, emptyScope.body);
  assert.equal(emptyScope.json().error.code, 'warehouse_scope_required');
  const nonStockkeeperScope = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${stockkeeper.user.id}`,
    headers: ownerHeaders,
    payload: { role: 'manager', status: 'active', warehouseScopeMode: 'selected', warehouseIds: [secondaryWarehouseId] },
  });
  assert.equal(nonStockkeeperScope.statusCode, 400, nonStockkeeperScope.body);
  const invalidScope = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${stockkeeper.user.id}`,
    headers: ownerHeaders,
    payload: { role: 'stockkeeper', status: 'active', warehouseScopeMode: 'selected', warehouseIds: ['00000000-0000-4000-8000-000000000001'] },
  });
  assert.equal(invalidScope.statusCode, 400, invalidScope.body);
  assert.equal(invalidScope.json().error.code, 'warehouse_scope_invalid');
  const scopeSaved = await app.inject({
    method: 'PATCH', url: `/api/stores/${storeId}/staff/members/${stockkeeper.user.id}`,
    headers: ownerHeaders,
    payload: { role: 'stockkeeper', status: 'active', warehouseScopeMode: 'selected', warehouseIds: [secondaryWarehouseId] },
  });
  assert.equal(scopeSaved.statusCode, 200, scopeSaved.body);

  const scopedHeaders = stockkeeper.headers;
  const visibleWarehouses = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: scopedHeaders });
  assert.equal(visibleWarehouses.statusCode, 200, visibleWarehouses.body);
  assert.deepEqual(visibleWarehouses.json().warehouses.map((warehouse) => warehouse.id), [secondaryWarehouseId]);
  const defaultInventory = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory`, headers: scopedHeaders });
  assert.equal(defaultInventory.statusCode, 200, defaultInventory.body);
  assert.equal(defaultInventory.json().warehouse.id, secondaryWarehouseId, 'default selection must fall back to an assigned active location');
  assert.equal(defaultInventory.json().products.find((product) => product.id === productId).on_hand, '0.000');
  const hiddenInventory = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/inventory?warehouseId=${mainWarehouseId}`, headers: scopedHeaders });
  assert.equal(hiddenInventory.statusCode, 404, hiddenInventory.body);
  const scopedProducts = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products`, headers: scopedHeaders });
  assert.equal(scopedProducts.json().products.find((product) => product.id === productId).on_hand, '0.000');

  const deniedOpeningPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import/preview`, headers: scopedHeaders,
    payload: { warehouseId: mainWarehouseId, items: [{ sku: 'SCOPE-OPENING-DENIED', name: 'Không được mở tồn', salePriceVnd: 100, openingQuantity: '4' }] },
  });
  assert.equal(deniedOpeningPreview.statusCode, 404, deniedOpeningPreview.body);
  const allowedOpeningPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import/preview`, headers: scopedHeaders,
    payload: { warehouseId: secondaryWarehouseId, items: [{ sku: 'SCOPE-OPENING-OK', name: 'Tồn đầu kỳ đúng kho', salePriceVnd: 100, openingQuantity: '3.25' }] },
  });
  assert.equal(allowedOpeningPreview.statusCode, 200, allowedOpeningPreview.body);
  assert.equal(allowedOpeningPreview.json().valid, true);
  assert.equal(allowedOpeningPreview.json().warehouseId, secondaryWarehouseId);
  const deniedOpeningImport = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-opening-denied-01' },
    payload: { warehouseId: mainWarehouseId, items: [{ sku: 'SCOPE-OPENING-DENIED', name: 'Không được mở tồn', salePriceVnd: 100, openingQuantity: '4' }] },
  });
  assert.equal(deniedOpeningImport.statusCode, 404, deniedOpeningImport.body);
  const allowedOpeningImport = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-opening-allowed-01' },
    payload: { warehouseId: secondaryWarehouseId, items: [{ sku: 'SCOPE-OPENING-OK', name: 'Tồn đầu kỳ đúng kho', salePriceVnd: 100, openingQuantity: '3.25' }] },
  });
  assert.equal(allowedOpeningImport.statusCode, 201, allowedOpeningImport.body);
  assert.equal(allowedOpeningImport.json().warehouseId, secondaryWarehouseId);
  const openingProductId = allowedOpeningImport.json().products[0].id;
  const openingBalances = await app.testDb.query(
    `SELECT warehouse_id, on_hand::text AS on_hand FROM inventory_balances
     WHERE store_id = $1 AND product_id = $2 ORDER BY warehouse_id`, [storeId, openingProductId]
  );
  assert.equal(openingBalances.rows.find((balance) => balance.warehouse_id === secondaryWarehouseId).on_hand, '3.250');
  assert.equal(openingBalances.rows.find((balance) => balance.warehouse_id === mainWarehouseId).on_hand, '0.000');
  const openingMovement = await app.testDb.query(
    `SELECT warehouse_id FROM inventory_movements WHERE store_id = $1 AND product_id = $2 AND source_type = 'opening_import'`,
    [storeId, openingProductId]
  );
  assert.equal(openingMovement.rows[0].warehouse_id, secondaryWarehouseId);
  const openingImportReplay = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-opening-allowed-01' },
    payload: { warehouseId: secondaryWarehouseId, items: [{ sku: 'SCOPE-OPENING-OK', name: 'Tồn đầu kỳ đúng kho', salePriceVnd: 100, openingQuantity: '3.25' }] },
  });
  assert.equal(openingImportReplay.statusCode, 201, openingImportReplay.body);
  assert.equal(openingImportReplay.headers['idempotent-replayed'], 'true');
  assert.equal(openingImportReplay.json().products[0].id, openingProductId);
  const openingMovementCount = await app.testDb.query(
    `SELECT count(*)::int AS count FROM inventory_movements WHERE store_id = $1 AND product_id = $2 AND source_type = 'opening_import'`,
    [storeId, openingProductId]
  );
  assert.equal(openingMovementCount.rows[0].count, 1);

  const deniedCountPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk/preview`, headers: scopedHeaders,
    payload: { warehouseId: mainWarehouseId, items: [{ productId: openingProductId, expectedInventoryVersion: 1, count: '3', sourceLine: 2 }] },
  });
  assert.equal(deniedCountPreview.statusCode, 404, deniedCountPreview.body);
  const deniedCountCommit = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-count-denied-main-01' },
    payload: { warehouseId: mainWarehouseId, reason: 'Không được kiểm kê kho khác', items: [{ productId: openingProductId, expectedInventoryVersion: 1, count: '3', sourceLine: 2 }] },
  });
  assert.equal(deniedCountCommit.statusCode, 404, deniedCountCommit.body);
  const scopedInventoryVersion = await app.testDb.query(
    `SELECT version FROM inventory_balances WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3`,
    [storeId, secondaryWarehouseId, openingProductId]
  );
  const scopedCountPayload = {
    warehouseId: secondaryWarehouseId,
    reason: 'Kiểm kê tại kho được giao',
    items: [{ productId: openingProductId, expectedInventoryVersion: scopedInventoryVersion.rows[0].version, count: '2.25', sourceLine: 2 }],
  };
  const scopedCountPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk/preview`, headers: scopedHeaders,
    payload: { warehouseId: scopedCountPayload.warehouseId, items: scopedCountPayload.items },
  });
  assert.equal(scopedCountPreview.statusCode, 200, scopedCountPreview.body);
  assert.equal(scopedCountPreview.json().valid, true);
  const scopedCountCommit = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/stock-adjustments/bulk`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-count-allowed-secondary-01' }, payload: scopedCountPayload,
  });
  assert.equal(scopedCountCommit.statusCode, 200, scopedCountCommit.body);
  const countedBalance = await app.testDb.query(
    `SELECT warehouse_id, on_hand::text AS on_hand FROM inventory_balances WHERE store_id = $1 AND product_id = $2 ORDER BY warehouse_id`,
    [storeId, openingProductId]
  );
  assert.equal(countedBalance.rows.find((balance) => balance.warehouse_id === secondaryWarehouseId).on_hand, '2.250');
  assert.equal(countedBalance.rows.find((balance) => balance.warehouse_id === mainWarehouseId).on_hand, '0.000');

  const inaccessiblePurchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-purchase-main-01' },
    payload: { productId, quantity: 1, unitCostVnd: '500', amountPaidVnd: '0', warehouseId: mainWarehouseId, supplierName: 'Không được ghi' },
  });
  assert.equal(inaccessiblePurchase.statusCode, 404, inaccessiblePurchase.body);
  const inaccessibleOrder = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-po-main-0001' },
    payload: { supplierId, warehouseId: mainWarehouseId, items: [{ productId, quantity: '1', unitCostVnd: '500' }] },
  });
  assert.equal(inaccessibleOrder.statusCode, 404, inaccessibleOrder.body);

  const scopedPurchase = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchases`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-purchase-secondary-01' },
    payload: { productId, quantity: 1, unitCostVnd: '500', amountPaidVnd: '0', warehouseId: secondaryWarehouseId, supplierName: 'Nhà cung cấp dùng để kiểm tra phạm vi' },
  });
  assert.equal(scopedPurchase.statusCode, 201, scopedPurchase.body);
  const scopedOrder = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/purchase-orders`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-po-secondary-001' },
    payload: { supplierId, warehouseId: secondaryWarehouseId, items: [{ productId, quantity: '1', unitCostVnd: '500' }] },
  });
  assert.equal(scopedOrder.statusCode, 201, scopedOrder.body);

  const transferDraft = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-owner-transfer-0001' },
    payload: { sourceWarehouseId: mainWarehouseId, destinationWarehouseId: secondaryWarehouseId, items: [{ productId, quantity: '1' }] },
  });
  assert.equal(transferDraft.statusCode, 201, transferDraft.body);
  const transferId = transferDraft.json().transfer.id;
  const dispatchedTransfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-owner-transfer-dispatch-01' }, payload: {},
  });
  assert.equal(dispatchedTransfer.statusCode, 200, dispatchedTransfer.body);
  const deniedDispatchDraft = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers`,
    headers: { ...ownerHeaders, 'idempotency-key': 'scope-owner-transfer-0002' },
    payload: { sourceWarehouseId: mainWarehouseId, destinationWarehouseId: secondaryWarehouseId, items: [{ productId, quantity: '1' }] },
  });
  assert.equal(deniedDispatchDraft.statusCode, 201, deniedDispatchDraft.body);
  const transferList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouse-transfers`, headers: scopedHeaders });
  assert.equal(transferList.statusCode, 200, transferList.body);
  assert.ok(transferList.json().transfers.some((item) => item.id === transferId));
  const deniedDispatch = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${deniedDispatchDraft.json().transfer.id}/dispatch`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-transfer-denied-01' }, payload: {},
  });
  assert.equal(deniedDispatch.statusCode, 404, deniedDispatch.body);
  const transferLine = await app.testDb.query(
    `SELECT id FROM warehouse_transfer_lines WHERE store_id = $1 AND transfer_id = $2`, [storeId, transferId]
  );
  const receivedTransfer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: { ...scopedHeaders, 'idempotency-key': 'scope-stock-transfer-receipt-01' },
    payload: { items: [{ transferLineId: transferLine.rows[0].id, quantity: '1' }] },
  });
  assert.equal(receivedTransfer.statusCode, 200, receivedTransfer.body);

  const scopedFinance = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/finance`, headers: scopedHeaders });
  assert.equal(scopedFinance.statusCode, 200, scopedFinance.body);
  assert.deepEqual(scopedFinance.json().purchases.map((purchase) => purchase.id), [scopedPurchase.json().purchase.id]);
  assert.deepEqual(scopedFinance.json().purchaseOrders.map((order) => order.id), [scopedOrder.json().purchaseOrder.id]);
  const scopedProductExport = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/products`, headers: scopedHeaders });
  assert.equal(scopedProductExport.statusCode, 200, scopedProductExport.body);
  const productLine = scopedProductExport.body.replace(/^\uFEFF/, '').split('\r\n').find((line) => line.includes(productId));
  assert.ok(productLine);
  assert.match(productLine, /,"2\.000","0\.000",/, 'product export totals only the one unit received and one unit transferred in the assigned warehouse');
  const scopedMovements = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/inventory-movements`, headers: scopedHeaders });
  assert.equal(scopedMovements.statusCode, 200, scopedMovements.body);
  assert.equal(scopedMovements.body.replace(/^\uFEFF/, '').trim().split('\r\n').length, 5, 'the movement export contains only scoped secondary-warehouse opening, count, receipt, and transfer movements');
});

test('business audit timeline is filterable and limited to authorized store managers', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, { email: 'audit-owner@example.com', displayName: 'Chủ nhật ký', storeName: 'Cửa hàng nhật ký' });
  const storeId = owner.store.id;
  const ownerHeaders = { cookie: cookieHeader(owner.cookies) };
  const csrfHeaders = { ...ownerHeaders, origin, 'x-csrf-token': owner.cookies.slink_csrf };

  const created = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers: csrfHeaders,
    payload: { sku: 'AUDIT-1', name: 'Sản phẩm nhật ký', salePriceVnd: 15000 },
  });
  assert.equal(created.statusCode, 200, created.body);

  const all = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events?limit=10`, headers: ownerHeaders });
  assert.equal(all.statusCode, 200, all.body);
  assert.equal(all.headers['cache-control'], 'no-store');
  assert.ok(all.json().total >= 1);
  const productEvent = all.json().events.find((event) => event.action === 'product.created');
  assert.ok(productEvent);
  assert.deepEqual(productEvent.actor, { id: owner.user.id, name: 'Chủ nhật ký' });
  assert.equal(productEvent.entityType, 'product');
  assert.equal(productEvent.entityId, created.json().product.id);
  assert.equal(Object.hasOwn(productEvent, 'metadata'), false, 'the timeline does not disclose internal metadata');
  await assert.rejects(
    app.testDb.query('UPDATE audit_events SET reason = $2 WHERE id = $1', [productEvent.id, 'sửa lịch sử']),
    /append-only/i,
  );
  await assert.rejects(
    app.testDb.query('DELETE FROM audit_events WHERE id = $1', [productEvent.id]),
    /append-only/i,
  );

  const filtered = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/audit-events?action=product.created&q=Chủ%20nhật%20ký&limit=1`, headers: ownerHeaders,
  });
  assert.equal(filtered.statusCode, 200, filtered.body);
  assert.equal(filtered.json().total, 1);
  assert.equal(filtered.json().events[0].action, 'product.created');
  assert.equal(filtered.json().nextOffset, null);

  const localDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const byDate = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/audit-events?from=${localDate}&to=${localDate}`, headers: ownerHeaders,
  });
  assert.equal(byDate.statusCode, 200, byDate.body);
  assert.ok(byDate.json().events.some((event) => event.id === productEvent.id));

  const invalidDate = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events?from=2026-02-30`, headers: ownerHeaders });
  assert.equal(invalidDate.statusCode, 400);
  const reversed = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events?from=2026-10-02&to=2026-10-01`, headers: ownerHeaders });
  assert.equal(reversed.statusCode, 400);

  const manager = await inviteAndLogin(app, {
    storeId, ownerHeaders: csrfHeaders, email: 'audit-manager@example.com', role: 'manager',
  });
  const managerRead = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events`, headers: manager.headers });
  assert.equal(managerRead.statusCode, 200, managerRead.body);

  const cashier = await inviteAndLogin(app, {
    storeId, ownerHeaders: csrfHeaders, email: 'audit-cashier@example.com', role: 'cashier',
  });
  const cashierRead = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events`, headers: cashier.headers });
  assert.equal(cashierRead.statusCode, 403, cashierRead.body);

  const otherStore = await registerAndLogin(app, { email: 'audit-other@example.com', displayName: 'Cửa hàng khác', storeName: 'Cửa hàng khác' });
  const crossStoreRead = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/audit-events`, headers: { cookie: cookieHeader(otherStore.cookies) } });
  assert.equal(crossStoreRead.statusCode, 403, crossStoreRead.body);
});

test('account security history is private and users can revoke only their own other sessions', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'security-owner@example.com', displayName: 'Chủ tài khoản', storeName: 'Cửa hàng bảo mật',
  });
  const firstHeaders = { cookie: cookieHeader(owner.cookies) };
  const firstSecurity = await app.inject({ method: 'GET', url: '/api/auth/security', headers: firstHeaders });
  assert.equal(firstSecurity.statusCode, 200, firstSecurity.body);
  assert.equal(firstSecurity.headers['cache-control'], 'no-store');
  assert.equal(firstSecurity.json().sessions.length, 1);
  assert.equal(firstSecurity.json().sessions[0].current, true);
  assert.equal(firstSecurity.json().events[0].type, 'login_succeeded');
  assert.ok(firstSecurity.json().events.some((event) => event.type === 'email_verified'));

  const rejected = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin },
    payload: { email: 'security-owner@example.com', password: 'wrong password 123' },
  });
  assert.equal(rejected.statusCode, 401);

  const secondLogin = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin },
    payload: { email: 'security-owner@example.com', password: 'correct horse battery staple 47' },
  });
  assert.equal(secondLogin.statusCode, 200, secondLogin.body);
  const secondCookies = cookiesFrom(secondLogin);
  const secondHeaders = { cookie: cookieHeader(secondCookies), origin, 'x-csrf-token': secondCookies.slink_csrf };
  const twoSessions = await app.inject({ method: 'GET', url: '/api/auth/security', headers: secondHeaders });
  assert.equal(twoSessions.statusCode, 200, twoSessions.body);
  assert.equal(twoSessions.json().sessions.length, 2);
  const oldSession = twoSessions.json().sessions.find((session) => !session.current);
  assert.ok(oldSession);

  const csrfDenied = await app.inject({
    method: 'POST', url: `/api/auth/sessions/${oldSession.id}/revoke`,
    headers: { ...secondHeaders, 'x-csrf-token': 'invalid' }, payload: {},
  });
  assert.equal(csrfDenied.statusCode, 403);

  const revoked = await app.inject({
    method: 'POST', url: `/api/auth/sessions/${oldSession.id}/revoke`, headers: secondHeaders, payload: {},
  });
  assert.equal(revoked.statusCode, 200, revoked.body);
  assert.equal(revoked.json().status, 'revoked');
  const oldSessionDenied = await app.inject({ method: 'GET', url: '/api/auth/me', headers: firstHeaders });
  assert.equal(oldSessionDenied.statusCode, 401);

  const currentSession = twoSessions.json().sessions.find((session) => session.current);
  const currentDenied = await app.inject({
    method: 'POST', url: `/api/auth/sessions/${currentSession.id}/revoke`, headers: secondHeaders, payload: {},
  });
  assert.equal(currentDenied.statusCode, 409);

  const afterRevoke = await app.inject({ method: 'GET', url: '/api/auth/security', headers: secondHeaders });
  assert.equal(afterRevoke.statusCode, 200, afterRevoke.body);
  assert.equal(afterRevoke.json().sessions.length, 1);
  assert.ok(afterRevoke.json().events.some((event) => event.type === 'login_failed'));
  assert.ok(afterRevoke.json().events.some((event) => event.type === 'session_revoked' && event.sessionId === oldSession.id));
  assert.ok(afterRevoke.json().events.every((event) => !Object.hasOwn(event, 'ip') && !Object.hasOwn(event, 'userAgent')));

  const other = await registerAndLogin(app, {
    email: 'security-other@example.com', displayName: 'Tài khoản khác', storeName: 'Cửa hàng khác',
  });
  const otherHeaders = { cookie: cookieHeader(other.cookies) };
  const privateHistory = await app.inject({ method: 'GET', url: '/api/auth/security', headers: otherHeaders });
  assert.equal(privateHistory.statusCode, 200, privateHistory.body);
  assert.ok(privateHistory.json().events.every((event) => event.sessionId !== oldSession.id));
  const crossAccountSession = await app.inject({
    method: 'POST', url: `/api/auth/sessions/${currentSession.id}/revoke`,
    headers: { cookie: cookieHeader(other.cookies), origin, 'x-csrf-token': other.cookies.slink_csrf }, payload: {},
  });
  assert.equal(crossAccountSession.statusCode, 404);
});

test('order notes and tags are tenant-scoped, append-only, auditable, and idempotent', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'order-collab-owner@example.com', displayName: 'Chủ đơn hàng', storeName: 'Cửa hàng đơn hàng',
  });
  const storeId = owner.store.id;
  const headers = {
    cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf,
  };
  const createdProduct = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products`, headers,
    payload: { sku: 'NOTE-01', name: 'Mặt hàng ghi chú', salePriceVnd: 100, inventoryTracked: false },
  });
  assert.equal(createdProduct.statusCode, 200, createdProduct.body);
  const sale = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/sales`, headers: { ...headers, 'idempotency-key': 'order-collab-sale-0001' },
    payload: { items: [{ productId: createdProduct.json().product.id, quantity: 1 },],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: 100 }] },
  });
  assert.equal(sale.statusCode, 201, sale.body);
  const orderId = sale.json().order.id;
  const base = `/api/stores/${storeId}/orders/${orderId}`;

  const initial = await app.inject({ method: 'GET', url: base, headers });
  assert.equal(initial.statusCode, 200, initial.body);
  assert.deepEqual(initial.json().order.internalNotes, []);
  assert.deepEqual(initial.json().order.tags, []);

  const noteKey = 'order-collab-note-0001';
  const notePayload = { note: 'Gọi khách trước khi giao vào buổi chiều.' };
  const noteHeaders = { ...headers, 'idempotency-key': noteKey };
  const failedNote = await app.testDb.exec(`
    CREATE FUNCTION fail_order_note_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'order.note_added' THEN RAISE EXCEPTION 'injected order.note_added audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER fail_order_note_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_order_note_audit();
  `);
  assert.ok(failedNote);
  const rolledBackNote = await app.inject({ method: 'POST', url: `${base}/internal-notes`, headers: noteHeaders, payload: notePayload });
  assert.equal(rolledBackNote.statusCode, 500, rolledBackNote.body);
  const rollbackState = await app.testDb.query(
    `SELECT (SELECT COUNT(*)::int FROM order_internal_notes WHERE store_id = $1 AND order_id = $2) AS notes,
            (SELECT COUNT(*)::int FROM idempotency_records WHERE store_id = $1 AND actor_user_id = $3 AND idempotency_key = $4) AS requests`,
    [storeId, orderId, owner.user.id, noteKey]
  );
  assert.deepEqual(rollbackState.rows[0], { notes: 0, requests: 0 });
  await app.testDb.exec('DROP TRIGGER fail_order_note_audit ON audit_events; DROP FUNCTION fail_order_note_audit();');

  const note = await app.inject({ method: 'POST', url: `${base}/internal-notes`, headers: noteHeaders, payload: notePayload });
  assert.equal(note.statusCode, 201, note.body);
  assert.equal(note.json().note.note, notePayload.note);
  assert.equal(note.json().note.actor.name, 'Chủ đơn hàng');
  const replay = await app.inject({ method: 'POST', url: `${base}/internal-notes`, headers: noteHeaders, payload: notePayload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  const changedReplay = await app.inject({
    method: 'POST', url: `${base}/internal-notes`, headers: noteHeaders, payload: { note: 'Nội dung khác.' },
  });
  assert.equal(changedReplay.statusCode, 409);
  const missingKey = await app.inject({ method: 'POST', url: `${base}/internal-notes`, headers, payload: notePayload });
  assert.equal(missingKey.statusCode, 400);
  const invalidNote = await app.inject({
    method: 'POST', url: `${base}/internal-notes`, headers: { ...headers, 'idempotency-key': 'order-collab-note-bad1' }, payload: { note: '  ' },
  });
  assert.equal(invalidNote.statusCode, 400);

  const addTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'order-collab-tag-add-01' },
    payload: { operation: 'add', tag: '  Khách   VIP  ' },
  });
  assert.equal(addTag.statusCode, 200, addTag.body);
  assert.equal(addTag.json().changed, true);
  assert.deepEqual(addTag.json().tags.map((tag) => tag.label), ['Khách VIP']);
  const duplicateTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'order-collab-tag-add-02' },
    payload: { operation: 'add', tag: 'khách vip' },
  });
  assert.equal(duplicateTag.statusCode, 200, duplicateTag.body);
  assert.equal(duplicateTag.json().changed, false);
  const removeTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'order-collab-tag-remove-01' },
    payload: { operation: 'remove', tag: 'KHÁCH VIP' },
  });
  assert.equal(removeTag.statusCode, 200, removeTag.body);
  assert.deepEqual(removeTag.json().tags, []);
  const reAddTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'order-collab-tag-readd-01' },
    payload: { operation: 'add', tag: 'Khách VIP' },
  });
  assert.equal(reAddTag.statusCode, 200, reAddTag.body);
  assert.equal(reAddTag.json().tags.length, 1);
  const invalidTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'order-collab-tag-invalid-01' },
    payload: { operation: 'add', tag: 'VIP!' },
  });
  assert.equal(invalidTag.statusCode, 400);
  const badCsrf = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'x-csrf-token': 'invalid', 'idempotency-key': 'order-collab-tag-csrf-01' },
    payload: { operation: 'remove', tag: 'VIP' },
  });
  assert.equal(badCsrf.statusCode, 403);

  const other = await registerAndLogin(app, {
    email: 'order-collab-other@example.com', displayName: 'Chủ khác', storeName: 'Cửa hàng khác',
  });
  const crossStore = await app.inject({
    method: 'POST', url: `${base}/internal-notes`,
    headers: { cookie: cookieHeader(other.cookies), origin, 'x-csrf-token': other.cookies.slink_csrf, 'idempotency-key': 'order-collab-cross-store-01' },
    payload: { note: 'Không được nhìn thấy đơn khác.' },
  });
  assert.equal(crossStore.statusCode, 403);

  const details = await app.inject({ method: 'GET', url: base, headers });
  assert.equal(details.statusCode, 200, details.body);
  assert.equal(details.json().order.internalNotesTotal, 1);
  assert.deepEqual(details.json().order.internalNotes.map((item) => item.note), [notePayload.note]);
  assert.deepEqual(details.json().order.tags.map((tag) => tag.label), ['Khách VIP']);
  const history = await app.testDb.query(
    `SELECT operation, tag FROM order_tag_events WHERE store_id = $1 AND order_id = $2 ORDER BY id`, [storeId, orderId]
  );
  assert.deepEqual(history.rows.map((row) => row.operation), ['added', 'removed', 'added']);
  const audit = await app.testDb.query(
    `SELECT action FROM audit_events WHERE store_id = $1 AND entity_type = 'order' AND entity_id = $2 ORDER BY occurred_at, action`,
    [storeId, orderId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action).sort(), ['sale.created', 'order.note_added', 'order.tag_added', 'order.tag_added', 'order.tag_removed'].sort());
  const privileges = await app.testDb.query(
    `SELECT has_table_privilege('slink_app', 'public.order_internal_notes', 'UPDATE') AS note_update,
            has_table_privilege('slink_app', 'public.order_internal_notes', 'DELETE') AS note_delete,
            has_table_privilege('slink_app', 'public.order_tag_events', 'UPDATE') AS tag_update,
            has_table_privilege('slink_app', 'public.order_tag_events', 'TRUNCATE') AS tag_truncate`
  );
  assert.deepEqual(privileges.rows[0], { note_update: false, note_delete: false, tag_update: false, tag_truncate: false });

  await app.testDb.query(
    `INSERT INTO order_internal_notes (store_id, order_id, actor_user_id, note)
     SELECT $1, $2, $3, 'Ghi chú phân trang ' || item::text
     FROM generate_series(1, 205) AS item`,
    [storeId, orderId, owner.user.id]
  );
  const latestPage = await app.inject({ method: 'GET', url: base, headers });
  assert.equal(latestPage.statusCode, 200, latestPage.body);
  assert.equal(latestPage.json().order.internalNotesTotal, 206);
  assert.equal(latestPage.json().order.internalNotes.length, 100);
  assert.equal(latestPage.json().order.internalNotesNextBeforeId, latestPage.json().order.internalNotes[0].id);
  const firstOlderPage = await app.inject({
    method: 'GET', url: `${base}/internal-notes?beforeId=${latestPage.json().order.internalNotes[0].id}&limit=100`, headers,
  });
  assert.equal(firstOlderPage.statusCode, 200, firstOlderPage.body);
  assert.equal(firstOlderPage.json().notes.length, 100);
  assert.equal(firstOlderPage.json().hasMore, true);
  assert.equal(BigInt(firstOlderPage.json().notes.at(-1).id) < BigInt(latestPage.json().order.internalNotes[0].id), true);
  const finalOlderPage = await app.inject({
    method: 'GET', url: `${base}/internal-notes?beforeId=${firstOlderPage.json().nextBeforeId}&limit=100`, headers,
  });
  assert.equal(finalOlderPage.statusCode, 200, finalOlderPage.body);
  assert.equal(finalOlderPage.json().notes.length, 6);
  assert.equal(finalOlderPage.json().hasMore, false);
  assert.equal(finalOlderPage.json().nextBeforeId, null);
  const allLoadedIds = [
    ...finalOlderPage.json().notes,
    ...firstOlderPage.json().notes,
    ...latestPage.json().order.internalNotes,
  ].map((item) => item.id);
  assert.equal(new Set(allLoadedIds).size, 206);
  const invalidCursor = await app.inject({ method: 'GET', url: `${base}/internal-notes?beforeId=0`, headers });
  assert.equal(invalidCursor.statusCode, 400);
  const crossStoreHistory = await app.inject({
    method: 'GET', url: `${base}/internal-notes?beforeId=${latestPage.json().order.internalNotes[0].id}`,
    headers: { cookie: cookieHeader(other.cookies) },
  });
  assert.equal(crossStoreHistory.statusCode, 403);
});

test('customer tags support auditable CRM filtering and safe append-only mutations', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'customer-tags-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng CRM',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const created = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`, headers: { ...headers, 'idempotency-key': 'customer-tags-create-0001' },
    payload: { name: 'Khách cần phân loại', phone: '0912345678', email: '', note: '' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const customerId = created.json().customer.id;
  const base = `/api/stores/${storeId}/customers/${customerId}`;
  const initial = await app.inject({ method: 'GET', url: base, headers });
  assert.equal(initial.statusCode, 200, initial.body);
  assert.deepEqual(initial.json().customer.tags, []);

  const repeatCustomer = (await app.testDb.query(
    `INSERT INTO customers (store_id, name, created_by) VALUES ($1, 'Khách mua lại', $2) RETURNING id`,
    [storeId, owner.user.id]
  )).rows[0].id;
  const inactiveCustomer = (await app.testDb.query(
    `INSERT INTO customers (store_id, name, created_by) VALUES ($1, 'Khách lâu chưa mua', $2) RETURNING id`,
    [storeId, owner.user.id]
  )).rows[0].id;
  await app.testDb.query(
    `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
     VALUES ($1, $2, 'manual_debit', 2500, 'opening_balance', gen_random_uuid(), 'Fixture công nợ phân khúc', $3)`,
    [storeId, customerId, owner.user.id]
  );
  await app.testDb.query(
    `INSERT INTO orders (store_id, order_number, customer_id, cashier_id, subtotal_vnd, total_vnd, occurred_at)
     VALUES ($1, 'CRM-SEGMENT-REPEAT-001', $2, $3, 12000, 12000, now() - interval '3 days'),
            ($1, 'CRM-SEGMENT-REPEAT-002', $2, $3, 25000, 25000, now() - interval '2 days'),
            ($1, 'CRM-SEGMENT-INACTIVE-001', $4, $3, 50000, 50000, now() - interval '91 days')`,
    [storeId, repeatCustomer, owner.user.id, inactiveCustomer]
  );
  const noPurchase = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=no_purchase`, headers });
  assert.equal(noPurchase.statusCode, 200, noPurchase.body);
  assert.ok(noPurchase.json().customers.some((customer) => customer.id === customerId));
  assert.ok(noPurchase.json().customers.every((customer) => customer.order_count === 0));
  const owing = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=owing`, headers });
  assert.equal(owing.statusCode, 200, owing.body);
  assert.deepEqual(owing.json().customers.map((customer) => customer.id), [customerId]);
  assert.equal(owing.json().customers[0].balance_vnd, '2500');
  const repeat = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=repeat`, headers });
  assert.equal(repeat.statusCode, 200, repeat.body);
  assert.deepEqual(repeat.json().customers.map((customer) => customer.id), [repeatCustomer]);
  assert.equal(repeat.json().customers[0].order_count, 2);
  assert.equal(repeat.json().customers[0].total_spent_vnd, '37000');
  const inactive = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=inactive90`, headers });
  assert.equal(inactive.statusCode, 200, inactive.body);
  assert.deepEqual(inactive.json().customers.map((customer) => customer.id), [inactiveCustomer]);
  const spendThreshold = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=repeat&minSpentVnd=37000`, headers });
  assert.equal(spendThreshold.statusCode, 200, spendThreshold.body);
  assert.deepEqual(spendThreshold.json().customers.map((customer) => customer.id), [repeatCustomer]);
  const spendAboveThreshold = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=repeat&minSpentVnd=37001`, headers });
  assert.equal(spendAboveThreshold.statusCode, 200, spendAboveThreshold.body);
  assert.equal(spendAboveThreshold.json().total, 0);
  const invalidSegment = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?segment=vip`, headers });
  assert.equal(invalidSegment.statusCode, 400);
  const invalidSpendThreshold = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?minSpentVnd=1.5`, headers });
  assert.equal(invalidSpendThreshold.statusCode, 400);

  const addHeaders = { ...headers, 'idempotency-key': 'customer-tags-add-vip-001' };
  const payload = { operation: 'add', tag: '  Khách   VIP  ' };
  await app.testDb.exec(`
    CREATE FUNCTION fail_customer_tag_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'customer.tag_added' THEN RAISE EXCEPTION 'injected customer.tag_added audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER fail_customer_tag_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_customer_tag_audit();
  `);
  const auditFailure = await app.inject({ method: 'POST', url: `${base}/tags`, headers: addHeaders, payload });
  assert.equal(auditFailure.statusCode, 500, auditFailure.body);
  let rollback = await app.testDb.query(
    `SELECT (SELECT COUNT(*)::int FROM customer_tag_events WHERE store_id = $1 AND customer_id = $2) AS tags,
            (SELECT COUNT(*)::int FROM idempotency_records WHERE store_id = $1 AND actor_user_id = $3 AND idempotency_key = $4) AS requests`,
    [storeId, customerId, owner.user.id, addHeaders['idempotency-key']]
  );
  assert.deepEqual(rollback.rows[0], { tags: 0, requests: 0 });
  await app.testDb.exec('DROP TRIGGER fail_customer_tag_audit ON audit_events; DROP FUNCTION fail_customer_tag_audit();');

  const missingKey = await app.inject({ method: 'POST', url: `${base}/tags`, headers, payload });
  assert.equal(missingKey.statusCode, 400);
  const invalidTag = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-invalid-001' },
    payload: { operation: 'add', tag: 'VIP!' },
  });
  assert.equal(invalidTag.statusCode, 400);
  const badCsrf = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...addHeaders, 'x-csrf-token': 'invalid' }, payload,
  });
  assert.equal(badCsrf.statusCode, 403);

  const added = await app.inject({ method: 'POST', url: `${base}/tags`, headers: addHeaders, payload });
  assert.equal(added.statusCode, 200, added.body);
  assert.equal(added.json().changed, true);
  assert.deepEqual(added.json().tags.map((tag) => tag.label), ['Khách VIP']);
  const replay = await app.inject({ method: 'POST', url: `${base}/tags`, headers: addHeaders, payload });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  const conflictingReplay = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: addHeaders, payload: { operation: 'add', tag: 'Nhóm khác' },
  });
  assert.equal(conflictingReplay.statusCode, 409);

  const duplicate = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-duplicate-001' },
    payload: { operation: 'add', tag: 'khách vip' },
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(duplicate.json().changed, false);
  const matchingList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?tag=KH%C3%81CH%20VIP`, headers });
  assert.equal(matchingList.statusCode, 200, matchingList.body);
  assert.equal(matchingList.json().total, 1);
  assert.deepEqual(matchingList.json().customers[0].tags.map((tag) => tag.label), ['Khách VIP']);
  const csv = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/exports/customers`, headers });
  assert.equal(csv.statusCode, 200, csv.body);
  assert.match(csv.body, /"Nhãn phân loại"/);
  assert.match(csv.body, /"Khách VIP"/);

  const remove = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-remove-vip-01' },
    payload: { operation: 'remove', tag: 'KHÁCH VIP' },
  });
  assert.equal(remove.statusCode, 200, remove.body);
  assert.deepEqual(remove.json().tags, []);
  const emptyList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?tag=Kh%C3%A1ch%20VIP`, headers });
  assert.equal(emptyList.statusCode, 200, emptyList.body);
  assert.equal(emptyList.json().total, 0);
  const readd = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-readd-vip-01' },
    payload: { operation: 'add', tag: 'Khách VIP' },
  });
  assert.equal(readd.statusCode, 200, readd.body);

  await app.testDb.query(
    `INSERT INTO customer_tag_events (store_id, customer_id, actor_user_id, tag, tag_key, operation)
     SELECT $1, $2, $3, 'Nhóm ' || item::text, 'nhóm ' || item::text, 'added'
     FROM generate_series(1, 19) AS item`,
    [storeId, customerId, owner.user.id]
  );
  const overLimit = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-over-limit-1' },
    payload: { operation: 'add', tag: 'Không nhận thêm' },
  });
  assert.equal(overLimit.statusCode, 409);
  assert.equal(overLimit.json().error.code, 'customer_tag_limit');

  const other = await registerAndLogin(app, {
    email: 'customer-tags-other@example.com', displayName: 'Chủ khác', storeName: 'Cửa hàng khác',
  });
  const crossStore = await app.inject({
    method: 'POST', url: `${base}/tags`,
    headers: { cookie: cookieHeader(other.cookies), origin, 'x-csrf-token': other.cookies.slink_csrf, 'idempotency-key': 'customer-tags-cross-store-01' },
    payload: { operation: 'remove', tag: 'Khách VIP' },
  });
  assert.equal(crossStore.statusCode, 403);
  const invalidFilter = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/customers?tag=VIP%21`, headers });
  assert.equal(invalidFilter.statusCode, 400);
  await app.testDb.query('UPDATE memberships SET role = $3 WHERE store_id = $1 AND user_id = $2', [storeId, owner.user.id, 'accountant']);
  const accountantTagWrite = await app.inject({
    method: 'POST', url: `${base}/tags`, headers: { ...headers, 'idempotency-key': 'customer-tags-accountant-01' },
    payload: { operation: 'remove', tag: 'Khách VIP' },
  });
  assert.equal(accountantTagWrite.statusCode, 403);

  const audit = await app.testDb.query(
    `SELECT action FROM audit_events WHERE store_id = $1 AND entity_type = 'customer' AND entity_id = $2 ORDER BY id`,
    [storeId, customerId]
  );
  assert.deepEqual(audit.rows.map((row) => row.action).sort(), [
    'customer.created', 'customer.tag_added', 'customer.tag_removed', 'customer.tag_added',
  ].sort());
  const history = await app.testDb.query(
    `SELECT operation, tag FROM customer_tag_events WHERE store_id = $1 AND customer_id = $2 ORDER BY id`, [storeId, customerId]
  );
  assert.deepEqual(history.rows.slice(0, 3).map((row) => [row.operation, row.tag]), [
    ['added', 'Khách VIP'], ['removed', 'KHÁCH VIP'], ['added', 'Khách VIP'],
  ]);
  const privileges = await app.testDb.query(
    `SELECT has_table_privilege('slink_app', 'public.customer_tag_events', 'SELECT') AS can_select,
            has_table_privilege('slink_app', 'public.customer_tag_events', 'INSERT') AS can_insert,
            has_table_privilege('slink_app', 'public.customer_tag_events', 'UPDATE') AS can_update,
            has_table_privilege('slink_app', 'public.customer_tag_events', 'DELETE') AS can_delete,
            has_table_privilege('slink_app', 'public.customer_tag_events', 'TRUNCATE') AS can_truncate,
            has_sequence_privilege('slink_app', 'public.customer_tag_events_id_seq', 'USAGE') AS sequence_usage,
            has_sequence_privilege('slink_app', 'public.customer_tag_events_id_seq', 'SELECT') AS sequence_select,
            has_sequence_privilege('slink_app', 'public.customer_tag_events_id_seq', 'UPDATE') AS sequence_update,
            (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.customer_tag_events'::regclass) AS forced_rls`
  );
  assert.deepEqual(privileges.rows[0], {
    can_select: true, can_insert: true, can_update: false, can_delete: false, can_truncate: false,
    sequence_usage: true, sequence_select: true, sequence_update: false, forced_rls: true,
  });
});

test('saved customer segments are tenant-scoped, auditable, versioned and idempotent', async (t) => {
  const app = await testApp(t);
  const owner = await registerAndLogin(app, {
    email: 'customer-segments-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng bộ lọc',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const customer = (await app.testDb.query(
    `INSERT INTO customers (store_id, name, created_by) VALUES ($1, 'Khách có công nợ', $2) RETURNING id`,
    [storeId, owner.user.id]
  )).rows[0].id;
  const order = (await app.testDb.query(
    `INSERT INTO orders (store_id, order_number, customer_id, cashier_id, subtotal_vnd, total_vnd)
     VALUES ($1, 'SAVED-SEGMENT-ORDER-001', $2, $3, 2000, 2000) RETURNING id`,
    [storeId, customer, owner.user.id]
  )).rows[0].id;
  await app.testDb.query(
    `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
     VALUES ($1, $2, 'manual_debit', 2000, 'opening_balance', gen_random_uuid(), 'Dư nợ kiểm tra bộ lọc', $3)`,
    [storeId, customer, owner.user.id]
  );
  const tagResponse = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers/${customer}/tags`,
    headers: { ...headers, 'idempotency-key': 'saved-segment-tag-add-001' }, payload: { operation: 'add', tag: 'VIP' },
  });
  assert.equal(tagResponse.statusCode, 200, tagResponse.body);

  const collectionUrl = `/api/stores/${storeId}/customer-segments`;
  const missingKey = await app.inject({ method: 'POST', url: collectionUrl, headers, payload: { name: 'VIP', criteria: { tag: 'VIP' } } });
  assert.equal(missingKey.statusCode, 400);
  const emptyCriteria = await app.inject({
    method: 'POST', url: collectionUrl,
    headers: { ...headers, 'idempotency-key': 'saved-segment-empty-0001' }, payload: { name: 'Empty', criteria: {} },
  });
  assert.equal(emptyCriteria.statusCode, 400);
  const invalidCriteria = await app.inject({
    method: 'POST', url: collectionUrl,
    headers: { ...headers, 'idempotency-key': 'saved-segment-invalid-01' }, payload: { name: 'Invalid', criteria: { segment: 'vip' } },
  });
  assert.equal(invalidCriteria.statusCode, 400);

  const createHeaders = { ...headers, 'idempotency-key': 'saved-segment-create-001' };
  const createPayload = { name: '  Khách   VIP nợ ', criteria: { segment: 'owing', tag: ' VIP ', minSpentVnd: '2000' } };
  const created = await app.inject({ method: 'POST', url: collectionUrl, headers: createHeaders, payload: createPayload });
  assert.equal(created.statusCode, 201, created.body);
  const saved = created.json().segment;
  assert.equal(saved.name, 'Khách VIP nợ');
  assert.deepEqual(saved.criteria, { segment: 'owing', tag: 'VIP', minSpentVnd: '2000' });
  const replay = await app.inject({ method: 'POST', url: collectionUrl, headers: createHeaders, payload: createPayload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.json().segment.id, saved.id);
  const duplicateName = await app.inject({
    method: 'POST', url: collectionUrl,
    headers: { ...headers, 'idempotency-key': 'saved-segment-duplicate-1' },
    payload: { name: 'khách vip NỢ', criteria: { tag: 'VIP' } },
  });
  assert.equal(duplicateName.statusCode, 409);

  const list = await app.inject({ method: 'GET', url: collectionUrl, headers });
  assert.equal(list.statusCode, 200, list.body);
  assert.deepEqual(list.json().segments.map((segment) => segment.id), [saved.id]);
  const applied = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/customers?segment=${saved.criteria.segment}&tag=${encodeURIComponent(saved.criteria.tag)}&minSpentVnd=${saved.criteria.minSpentVnd}`,
    headers,
  });
  assert.equal(applied.statusCode, 200, applied.body);
  assert.deepEqual(applied.json().customers.map((row) => row.id), [customer]);
  assert.equal(applied.json().customers[0].total_spent_vnd, '2000');

  const updatedPayload = { name: 'Khách VIP nợ nhiều', criteria: { segment: 'owing', tag: 'VIP', minSpentVnd: '2001' }, version: 1 };
  const updateHeaders = { ...headers, 'idempotency-key': 'saved-segment-update-001' };
  const updated = await app.inject({ method: 'PUT', url: `${collectionUrl}/${saved.id}`, headers: updateHeaders, payload: updatedPayload });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().segment.version, 2);
  const updateReplay = await app.inject({ method: 'PUT', url: `${collectionUrl}/${saved.id}`, headers: updateHeaders, payload: updatedPayload });
  assert.equal(updateReplay.statusCode, 200, updateReplay.body);
  assert.equal(updateReplay.headers['idempotent-replayed'], 'true');
  assert.equal(updateReplay.json().segment.version, 2);
  const staleUpdate = await app.inject({
    method: 'PUT', url: `${collectionUrl}/${saved.id}`,
    headers: { ...headers, 'idempotency-key': 'saved-segment-stale-001' }, payload: updatedPayload,
  });
  assert.equal(staleUpdate.statusCode, 409);
  assert.equal(staleUpdate.json().error.code, 'customer_segment_stale');

  const deleteUrl = `${collectionUrl}/${saved.id}/delete`;
  const deleteHeaders = { ...headers, 'idempotency-key': 'saved-segment-delete-001' };
  const deleted = await app.inject({ method: 'POST', url: deleteUrl, headers: deleteHeaders, payload: { version: 2 } });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal(deleted.json().deleted, true);
  const deleteReplay = await app.inject({ method: 'POST', url: deleteUrl, headers: deleteHeaders, payload: { version: 2 } });
  assert.equal(deleteReplay.headers['idempotent-replayed'], 'true');
  const afterDelete = await app.inject({ method: 'GET', url: collectionUrl, headers });
  assert.deepEqual(afterDelete.json().segments, []);

  await app.testDb.exec(`
    CREATE FUNCTION fail_customer_segment_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'customer_segment.created' THEN RAISE EXCEPTION 'injected customer segment audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER fail_customer_segment_audit BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_customer_segment_audit();
  `);
  const auditFailureKey = 'saved-segment-audit-failure-01';
  const auditFailure = await app.inject({
    method: 'POST', url: collectionUrl,
    headers: { ...headers, 'idempotency-key': auditFailureKey },
    payload: { name: 'Không lưu khi lỗi audit', criteria: { tag: 'VIP' } },
  });
  assert.equal(auditFailure.statusCode, 500, auditFailure.body);
  const rollback = await app.testDb.query(
    `SELECT (SELECT COUNT(*)::int FROM customer_saved_segments WHERE store_id = $1) AS segments,
            (SELECT COUNT(*)::int FROM idempotency_records WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3) AS requests`,
    [storeId, owner.user.id, auditFailureKey]
  );
  assert.deepEqual(rollback.rows[0], { segments: 0, requests: 0 });
  await app.testDb.exec('DROP TRIGGER fail_customer_segment_audit ON audit_events; DROP FUNCTION fail_customer_segment_audit();');

  const other = await registerAndLogin(app, {
    email: 'customer-segments-other@example.com', displayName: 'Chủ khác', storeName: 'Cửa hàng khác',
  });
  const otherHeaders = { cookie: cookieHeader(other.cookies), origin, 'x-csrf-token': other.cookies.slink_csrf };
  const crossStore = await app.inject({ method: 'GET', url: collectionUrl, headers: otherHeaders });
  assert.equal(crossStore.statusCode, 403);
  await app.testDb.query('UPDATE memberships SET role = $3 WHERE store_id = $1 AND user_id = $2', [storeId, owner.user.id, 'cashier']);
  const cashierWrite = await app.inject({
    method: 'POST', url: collectionUrl,
    headers: { ...headers, 'idempotency-key': 'saved-segment-cashier-01' }, payload: { name: 'Cashier', criteria: { tag: 'VIP' } },
  });
  assert.equal(cashierWrite.statusCode, 403);

  const audits = await app.testDb.query(
    `SELECT action FROM audit_events WHERE store_id = $1 AND entity_type = 'customer_segment' ORDER BY id`, [storeId]
  );
  assert.deepEqual(audits.rows.map((row) => row.action).sort(), ['customer_segment.created', 'customer_segment.updated', 'customer_segment.deleted'].sort());
  const roleChecks = await app.testDb.query(`
    SELECT has_table_privilege('slink_app', 'public.customer_saved_segments', 'SELECT') AS can_select,
           has_table_privilege('slink_app', 'public.customer_saved_segments', 'INSERT') AS can_insert,
           has_table_privilege('slink_app', 'public.customer_saved_segments', 'UPDATE') AS can_update,
           has_table_privilege('slink_app', 'public.customer_saved_segments', 'DELETE') AS can_delete,
           has_table_privilege('slink_app', 'public.customer_saved_segments', 'TRUNCATE') AS can_truncate,
           (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.customer_saved_segments'::regclass) AS forced_rls
  `);
  assert.deepEqual(roleChecks.rows[0], { can_select: true, can_insert: true, can_update: true, can_delete: true, can_truncate: false, forced_rls: true });
});

test('promotion preview is read-only and a sale consumes its voucher atomically once', async (t) => {
  const app = await testApp(t);
  await app.testDb.exec(`
    REVOKE ALL ON public.promotions, public.promotion_redemptions FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.promotions TO slink_app;
    GRANT SELECT, INSERT ON public.promotion_redemptions TO slink_app;
  `);
  const roleBoundary = await app.testDb.query(`
    SELECT has_table_privilege('slink_app', 'public.promotions', 'SELECT') AS promotions_read,
           has_table_privilege('slink_app', 'public.promotions', 'UPDATE') AS promotions_update,
           has_table_privilege('slink_app', 'public.promotions', 'DELETE') AS promotions_delete,
           has_table_privilege('slink_app', 'public.promotion_redemptions', 'INSERT') AS redemptions_insert,
           has_table_privilege('slink_app', 'public.promotion_redemptions', 'UPDATE') AS redemptions_update,
           has_table_privilege('slink_app', 'public.promotion_redemptions', 'DELETE') AS redemptions_delete,
           (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.promotions'::regclass) AS promotions_forced_rls,
           (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.promotion_redemptions'::regclass) AS redemptions_forced_rls,
           EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotions' AND policyname = 'tenant_scope' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS promotions_tenant_policy,
           EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'promotion_redemptions' AND policyname = 'tenant_scope' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS redemptions_tenant_policy
  `);
  assert.deepEqual(roleBoundary.rows[0], {
    promotions_read: true, promotions_update: true, promotions_delete: false,
    redemptions_insert: true, redemptions_update: false, redemptions_delete: false,
    promotions_forced_rls: true, redemptions_forced_rls: true,
    promotions_tenant_policy: true, redemptions_tenant_policy: true,
  });
  const owner = await registerAndLogin(app, {
    email: 'promotion-owner@example.com', displayName: 'Chủ cửa hàng', storeName: 'Cửa hàng ưu đãi',
  });
  const storeId = owner.store.id;
  const headers = { cookie: cookieHeader(owner.cookies), origin, 'x-csrf-token': owner.cookies.slink_csrf };
  const customer = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/customers`, headers,
    payload: { name: 'Khách dùng voucher', phone: '0901234567' },
  });
  assert.equal(customer.statusCode, 201, customer.body);
  const imported = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/products/import`,
    headers: { ...headers, 'idempotency-key': 'promotion-stock-import-0001' },
    payload: { items: [{ sku: 'PROMO-001', name: 'Sản phẩm ưu đãi', salePriceVnd: 20000, costVnd: 8000, openingQuantity: '5' }] },
  });
  assert.equal(imported.statusCode, 201, imported.body);
  const productId = imported.json().products[0].id;

  const created = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/promotions`, headers,
    payload: {
      code: 'WELCOME10', name: 'Ưu đãi khách mới', discountType: 'percent', discountPercent: '10',
      minimumSubtotalVnd: '15000', maximumDiscountVnd: '1000', usageLimit: 1, perCustomerLimit: 1,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  const promotionId = created.json().promotion.id;
  const other = await registerAndLogin(app, {
    email: 'promotion-other@example.com', displayName: 'Chủ cửa hàng khác', storeName: 'Cửa hàng khác',
  });
  const crossStoreList = await app.inject({
    method: 'GET', url: `/api/stores/${storeId}/promotions`,
    headers: { cookie: cookieHeader(other.cookies), origin },
  });
  assert.equal(crossStoreList.statusCode, 403, crossStoreList.body);

  const preview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/promotions/preview`, headers,
    payload: { code: ' welcome10 ', subtotalVnd: '20000', customerId: customer.json().customer.id },
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().promotion.discountVnd, '1000');
  let usage = await app.testDb.query('SELECT usage_count FROM promotions WHERE store_id = $1 AND id = $2', [storeId, promotionId]);
  assert.equal(usage.rows[0].usage_count, 0, 'preview does not consume a redemption');

  const salePayload = {
    items: [{ productId, quantity: 1 }], customerId: customer.json().customer.id,
    promotionCode: 'WELCOME10', promotionDiscountVnd: '999999',
    tenders: [{ method: 'bank_transfer', amountReceivedVnd: '19000' }],
  };
  const saleHeaders = { ...headers, 'idempotency-key': 'promotion-sale-submit-0001' };
  const competingHeaders = { ...headers, 'idempotency-key': 'promotion-sale-submit-0002' };
  const [saleAttempt, competingAttempt] = await Promise.all([
    app.inject({ method: 'POST', url: `/api/stores/${storeId}/sales`, headers: saleHeaders, payload: salePayload }),
    app.inject({ method: 'POST', url: `/api/stores/${storeId}/sales`, headers: competingHeaders, payload: salePayload }),
  ]);
  const sale = saleAttempt.statusCode === 201 ? saleAttempt : competingAttempt;
  const successfulHeaders = saleAttempt.statusCode === 201 ? saleHeaders : competingHeaders;
  const rejectedAttempt = saleAttempt.statusCode === 201 ? competingAttempt : saleAttempt;
  assert.equal(sale.statusCode, 201, sale.body);
  assert.equal(rejectedAttempt.statusCode, 422, rejectedAttempt.body);
  assert.equal(rejectedAttempt.json().error.code, 'promotion_limit_reached');
  assert.equal(sale.json().order.discountVnd, '1000', 'server ignores client-supplied discount amounts');
  assert.equal(sale.json().order.totalVnd, '19000');
  assert.equal(sale.json().order.promotion.code, 'WELCOME10');

  const retry = await app.inject({ method: 'POST', url: `/api/stores/${storeId}/sales`, headers: successfulHeaders, payload: salePayload });
  assert.equal(retry.statusCode, 201, retry.body);
  assert.equal(retry.headers['idempotent-replayed'], 'true');
  const orderId = sale.json().order.id;
  const detail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderId}`, headers });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.deepEqual(detail.json().order.promotion, { code: 'WELCOME10', discountVnd: '1000' });

  const exhaustedPreview = await app.inject({
    method: 'POST', url: `/api/stores/${storeId}/promotions/preview`, headers,
    payload: { code: 'WELCOME10', subtotalVnd: '20000', customerId: customer.json().customer.id },
  });
  assert.equal(exhaustedPreview.statusCode, 422, exhaustedPreview.body);
  assert.equal(exhaustedPreview.json().error.code, 'promotion_limit_reached');
  usage = await app.testDb.query(`
    SELECT p.usage_count, COUNT(r.id)::int AS redemption_count
    FROM promotions p LEFT JOIN promotion_redemptions r ON r.store_id = p.store_id AND r.promotion_id = p.id
    WHERE p.store_id = $1 AND p.id = $2 GROUP BY p.usage_count`, [storeId, promotionId]);
  assert.deepEqual(usage.rows[0], { usage_count: 1, redemption_count: 1 });
  const inventory = await app.testDb.query('SELECT on_hand::text AS on_hand FROM inventory_balances WHERE store_id = $1 AND product_id = $2', [storeId, productId]);
  assert.equal(inventory.rows[0].on_hand, '4.000', 'replay does not change stock twice');
});
