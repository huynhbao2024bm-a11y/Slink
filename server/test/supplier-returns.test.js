'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const returnsUi = require('../../supplier-returns-ui');

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

async function setupApp(t) {
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
  return { app, db };
}

async function inviteAndLoginStaff(app, storeId, ownerHeaders, email, role, displayName, password) {
  const invite = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/invitations`,
    headers: ownerHeaders,
    payload: { email, role },
  });
  assert.equal(invite.statusCode, 201, invite.body);
  const inviteTok = new URLSearchParams(new URL(invite.json().developmentInviteUrl).hash.slice(1)).get('invite');
  const reg = await app.inject({
    method: 'POST',
    url: `/api/invitations/${inviteTok}/register`,
    headers: { origin },
    payload: { displayName, password },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  const vTok = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: vTok } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  const cookies = cookiesFrom(login);
  return {
    userId: login.json().user.id,
    headers: {
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      origin,
      'x-csrf-token': cookies.slink_csrf,
    },
  };
}

async function seedStore(app) {
  const email = 'trackb-owner@example.com';
  const password = 'correct horse battery staple 53';
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email, displayName: 'Chủ Cửa Hàng', storeName: 'Cửa Hàng Track B', password },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  const vTok = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: vTok } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  const cookies = cookiesFrom(login);
  const ownerHeaders = {
    cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
    origin,
    'x-csrf-token': cookies.slink_csrf,
  };
  const storeId = login.json().stores[0].id;
  const whRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: ownerHeaders });
  const warehouseId = whRes.json().warehouses[0].id;

  const createProduct = async (sku, name, salePriceVnd, costVnd) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/stores/${storeId}/products`,
      headers: ownerHeaders,
      payload: { sku, name, category: 'Thời trang', unit: 'cái', salePriceVnd, costVnd, lowStockThreshold: 1, inventoryTracked: true },
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().product;
  };

  const shirtA = await createProduct('SHIRT-A', 'Áo thun M', 100000, 50000);
  const jacketB = await createProduct('JACKET-B', 'Áo khoác L', 150000, 80000);
  const pantsC = await createProduct('PANTS-C', 'Quần jean S', 70000, 35000);

  const supRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/suppliers`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { name: 'Xưởng May An Phát' },
  });
  assert.equal(supRes.statusCode, 201, supRes.body);
  const supplierId = supRes.json().supplier.id;

  return { storeId, warehouseId, ownerHeaders, supplierId, shirtA, jacketB, pantsC, password };
}

test('supplier returns update stock, supplier payable ledger, cash inflows, and block over-returns', async (t) => {
  const { app, db } = await setupApp(t);
  const { storeId, warehouseId, ownerHeaders, supplierId, shirtA, jacketB, password } = await seedStore(app);

  // Open cash register shift for supplier refund tests
  const openShift = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 500000 },
  });
  assert.equal(openShift.statusCode, 201, openShift.body);

  // Purchase 10 ShirtA @ 50k = 500k on credit (0 paid) from supplier
  const creditPur = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      supplierId,
      items: [{ productId: shirtA.id, quantity: 10, unitCostVnd: 50000 }],
      amountPaidVnd: 0,
      method: 'bank_transfer',
    },
  });
  assert.equal(creditPur.statusCode, 201, creditPur.body);
  const purchaseId = creditPur.json().purchase.id;

  // Return 4 ShirtA linked to purchaseId (decreases stock 10 -> 6, reduces payable 500k -> 300k)
  const srKey1 = randomUUID();
  const sr1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...ownerHeaders, 'idempotency-key': srKey1 },
    payload: {
      supplierId,
      purchaseId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 4 }],
      refundReceivedVnd: 0,
      reason: 'Hàng lỗi đường may đợt nhập đầu',
    },
  });
  assert.equal(sr1.statusCode, 201, sr1.body);
  assert.equal(sr1.json().supplierReturn.totalVnd, '200000');
  assert.equal(sr1.json().supplierReturn.netPayableReductionVnd, '200000');

  // Idempotency replay returns cached 201 without deducting twice
  const srReplay = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...ownerHeaders, 'idempotency-key': srKey1 },
    payload: {
      supplierId,
      purchaseId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 4 }],
      refundReceivedVnd: 0,
      reason: 'Hàng lỗi đường may đợt nhập đầu',
    },
  });
  assert.equal(srReplay.statusCode, 201);
  assert.equal(srReplay.headers['idempotent-replayed'], 'true');

  // Verify stock = 6 and supplier payable = 300000
  const prodList = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=20`, headers: ownerHeaders });
  const shirtRow = prodList.json().products.find((p) => p.id === shirtA.id);
  assert.equal(shirtRow.on_hand, '6.000');
  const supBal1 = (await db.query(
    `SELECT COALESCE(SUM(increases_payable_vnd) - SUM(decreases_payable_vnd), 0)::text AS bal
     FROM supplier_ledger_entries WHERE store_id = $1 AND supplier_id = $2`,
    [storeId, supplierId]
  )).rows[0].bal;
  assert.equal(supBal1, '300000');

  // Over-return linked to purchaseId (> 6 remaining purchased) rejects 409
  const overReturn = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      supplierId,
      purchaseId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 7 }],
      reason: 'Thử trả vượt số đã nhập',
    },
  });
  assert.equal(overReturn.statusCode, 409, overReturn.body);
  assert.equal(overReturn.json().error.code, 'return_quantity_exceeded');

  // Paid-in-full purchase (5 JacketB @ 80k = 400k, paid 400k bank_transfer) then return 2 with 160k cash refund
  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      supplierId,
      items: [{ productId: jacketB.id, quantity: 5, unitCostVnd: 80000 }],
      amountPaidVnd: 400000,
      method: 'bank_transfer',
    },
  });
  const sr2 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      supplierId,
      warehouseId,
      items: [{ productId: jacketB.id, quantity: 2, unitCostVnd: 80000 }],
      refundReceivedVnd: 160000,
      refundMethod: 'cash',
      reason: 'Trả 2 áo khoác nhận lại tiền mặt ngay',
    },
  });
  assert.equal(sr2.statusCode, 201, sr2.body);
  assert.equal(sr2.json().supplierReturn.netPayableReductionVnd, '0');

  // Payable balance stays 300000 while cash register expected cash rises by +160000 (500k -> 660k)
  const supBal2 = (await db.query(
    `SELECT COALESCE(SUM(increases_payable_vnd) - SUM(decreases_payable_vnd), 0)::text AS bal
     FROM supplier_ledger_entries WHERE store_id = $1 AND supplier_id = $2`,
    [storeId, supplierId]
  )).rows[0].bal;
  assert.equal(supBal2, '300000');
  const register = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: ownerHeaders });
  assert.equal(register.json().session.expectedCashVnd, '660000');

  // Stockkeeper cannot record cash refund inflow (403)
  const stockkeeper = await inviteAndLoginStaff(app, storeId, ownerHeaders, 'tb-stock@example.com', 'stockkeeper', 'Thủ Kho B', password);
  const stockCashDenied = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...stockkeeper.headers, 'idempotency-key': randomUUID() },
    payload: {
      supplierId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 1 }],
      refundReceivedVnd: 50000,
      refundMethod: 'cash',
      reason: 'Thủ kho thu tiền trực tiếp',
    },
  });
  assert.equal(stockCashDenied.statusCode, 403, stockCashDenied.body);

  // Stockkeeper cannot override unitCostVnd on unlinked returns (403)
  const stockCostOverrideDenied = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...stockkeeper.headers, 'idempotency-key': randomUUID() },
    payload: {
      supplierId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 1, unitCostVnd: 999999 }],
      reason: 'Thủ kho tự sửa đơn giá vốn',
    },
  });
  assert.equal(stockCostOverrideDenied.statusCode, 403, stockCostOverrideDenied.body);

  // Linked purchaseId rejects mismatched unitCostVnd override (400)
  const linkedCostMismatch = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/supplier-returns`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      supplierId,
      purchaseId,
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 1, unitCostVnd: 99000 }],
      reason: 'Thử sửa giá vốn phiếu nhập',
    },
  });
  assert.equal(linkedCostMismatch.statusCode, 400, linkedCostMismatch.body);

  // List endpoint & UI helper render cleanly
  const listRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/supplier-returns`, headers: ownerHeaders });
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.json().supplierReturns.length, 2);
  const html = returnsUi.renderSupplierReturnListHtml(listRes.json().supplierReturns);
  assert.match(html, /Xưởng May An Phát/);
});

test('seamless customer exchange preserves inventory, net cash drawer, customer ledger, and prevents partial-credit over-refunds', async (t) => {
  const { app, db } = await setupApp(t);
  const { storeId, warehouseId, ownerHeaders, shirtA, jacketB, pantsC, password } = await seedStore(app);

  // Open shift & seed inventory: 10 each
  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 500000 },
  });
  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      items: [
        { productId: shirtA.id, quantity: 10, unitCostVnd: 50000 },
        { productId: jacketB.id, quantity: 10, unitCostVnd: 80000 },
        { productId: pantsC.id, quantity: 10, unitCostVnd: 35000 },
      ],
      amountPaidVnd: 0,
      supplierName: 'Tổng Kho Sỉ',
      method: 'bank_transfer',
    },
  });

  // Create customer & cashier
  const custRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/customers`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { name: 'Chị Lan', phone: '0901234567' },
  });
  assert.equal(custRes.statusCode, 201, custRes.body);
  const customerId = custRes.json().customer.id;
  const cashier = await inviteAndLoginStaff(app, storeId, ownerHeaders, 'tb-cashier@example.com', 'cashier', 'Thu Ngân B', password);

  // Scenario A: Sale ShirtA (100k, paid 100k cash) -> Exchange for JacketB (150k), customer pays 60k cash (10k change)
  const saleA = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { warehouseId, items: [{ productId: shirtA.id, quantity: 1 }], amountReceivedVnd: 100000, method: 'cash' },
  });
  assert.equal(saleA.statusCode, 201, saleA.body);
  const orderAId = saleA.json().order.id;
  const orderADetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${orderAId}`, headers: ownerHeaders });
  const orderALineId = orderADetail.json().order.items[0].id;

  // Cashier cannot perform exchange directly (403)
  const cashierExchDenied = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${orderAId}/exchange`,
    headers: { ...cashier.headers, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Khách đổi size rộng hơn',
      returnItems: [{ orderLineId: orderALineId, quantity: 1 }],
      replacementItems: [{ productId: jacketB.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 50000 }],
    },
  });
  assert.equal(cashierExchDenied.statusCode, 403, cashierExchDenied.body);

  // Owner performs up-exchange atomically
  const exchKeyA = randomUUID();
  const exchA = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${orderAId}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': exchKeyA },
    payload: {
      reason: 'Khách đổi áo khoác bù tiền mặt',
      restockPolicy: 'restock',
      returnItems: [{ orderLineId: orderALineId, quantity: 1 }],
      replacementItems: [{ productId: jacketB.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 60000 }],
    },
  });
  assert.equal(exchA.statusCode, 201, exchA.body);
  const exchABody = exchA.json().exchange;
  assert.equal(exchABody.originalOrderStatus, 'returned');
  assert.equal(exchABody.netDeltaVnd, '50000');
  assert.equal(exchABody.extraPaidVnd, '50000');
  assert.equal(exchABody.changeVnd, '10000');
  assert.equal(exchABody.exchangeCreditAppliedVnd, '100000');

  // Drawer balance: 500k open + 100k saleA + 60k in - 10k change = 650k
  let register = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: ownerHeaders });
  assert.equal(register.json().session.expectedCashVnd, '650000');

  // Stock: ShirtA = 10 (restocked!), JacketB = 9
  let products = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=20`, headers: ownerHeaders })).json().products;
  assert.equal(products.find((p) => p.id === shirtA.id).on_hand, '10.000');
  assert.equal(products.find((p) => p.id === jacketB.id).on_hand, '9.000');

  // Scenario B: Down-exchange on replacement order (JacketB 150k -> PantsC 70k, store refunds 80k cash)
  const repOrderDetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${exchABody.replacementOrderId}`, headers: ownerHeaders });
  const repLineId = repOrderDetail.json().order.items[0].id;
  const exchB = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${exchABody.replacementOrderId}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Khách đổi sang quần rẻ hơn, hoàn 80k tiền mặt',
      returnItems: [{ orderLineId: repLineId, quantity: 1 }],
      replacementItems: [{ productId: pantsC.id, quantity: 1 }],
      refundMethod: 'cash',
    },
  });
  assert.equal(exchB.statusCode, 201, exchB.body);
  assert.equal(exchB.json().exchange.netDeltaVnd, '-80000');
  assert.equal(exchB.json().exchange.refundedVnd, '80000');

  // Drawer balance: 650k - 80k = 570k (500k float + 70k net value of PantsC)
  register = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/cash-register`, headers: ownerHeaders });
  assert.equal(register.json().session.expectedCashVnd, '570000');

  // Scenario C: Partial-credit anti-over-refund guard (buy ShirtA 100k + JacketB 150k = 250k, pay 150k cash, owe 100k;
  // exchange JacketB 150k for PantsC 70k => total kept+new = 170k vs 150k paid => customer STILL OWES 20k => ZERO cash refund!)
  const saleC = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      customerId,
      items: [{ productId: shirtA.id, quantity: 1 }, { productId: jacketB.id, quantity: 1 }],
      amountReceivedVnd: 150000,
      method: 'cash',
    },
  });
  assert.equal(saleC.statusCode, 201, saleC.body);
  const saleCDetail = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${saleC.json().order.id}`, headers: ownerHeaders });
  const jacketLineC = saleCDetail.json().order.items.find((i) => i.product_id === jacketB.id);

  const exchC = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${saleC.json().order.id}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Khách đang nợ 100k, trả áo khoác đổi quần để trừ nợ',
      returnItems: [{ orderLineId: jacketLineC.id, quantity: 1 }],
      replacementItems: [{ productId: pantsC.id, quantity: 1 }],
      refundMethod: 'cash',
    },
  });
  assert.equal(exchC.statusCode, 201, exchC.body);
  assert.equal(exchC.json().exchange.originalOrderStatus, 'partially_returned');
  assert.equal(exchC.json().exchange.netDeltaVnd, '-80000');
  assert.equal(exchC.json().exchange.refundedVnd, '0', 'Must not refund cash while customer still owes on net goods');

  // Customer net debt must be exactly 20000đ (250k - 150k paid - 150k return + 70k pants = 20k)
  const custBal = (await db.query(
    `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS bal
     FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
    [storeId, customerId]
  )).rows[0].bal;
  assert.equal(custBal, '20000');

  // Post-exchange customer debt collection succeeds cleanly without customer_ledger_mismatch!
  const debtPay = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/customers/${customerId}/payments`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { amountVnd: 20000, method: 'cash', note: 'Thu nốt 20k sau đổi hàng' },
  });
  assert.equal(debtPay.statusCode, 201, debtPay.body);
  const custBalAfter = (await db.query(
    `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS bal
     FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
    [storeId, customerId]
  )).rows[0].bal;
  assert.equal(custBalAfter, '0');

  // Sequential multi-line partial exchanges must NOT double-count exchange credit
  const multiSale = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId,
      items: [{ productId: shirtA.id, quantity: 1 }, { productId: pantsC.id, quantity: 1 }],
      amountReceivedVnd: 170000,
      method: 'cash',
    },
  });
  assert.equal(multiSale.statusCode, 201, multiSale.body);
  const mDetail = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${multiSale.json().order.id}`, headers: ownerHeaders })).json().order;
  const lineShirt = mDetail.items.find((i) => i.product_id === shirtA.id);
  const linePants = mDetail.items.find((i) => i.product_id === pantsC.id);

  // Partial Exchange 1: ShirtA (100k) -> JacketB (150k), paid 50k cash => 100k exchangeCredit used from multiSale
  const pEx1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${multiSale.json().order.id}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Đổi món 1 lấy áo khoác',
      returnItems: [{ orderLineId: lineShirt.id, quantity: 1 }],
      replacementItems: [{ productId: jacketB.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 50000 }],
    },
  });
  assert.equal(pEx1.statusCode, 201, pEx1.body);
  assert.equal(pEx1.json().exchange.exchangeCreditAppliedVnd, '100000');

  // Partial Exchange 2: remaining PantsC (70k) -> ShirtA (100k), paid 30k cash => MUST only get 70k credit (not 170k!)
  const pEx2 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${multiSale.json().order.id}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Đổi món 2 lấy áo thun',
      returnItems: [{ orderLineId: linePants.id, quantity: 1 }],
      replacementItems: [{ productId: shirtA.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 30000 }],
    },
  });
  assert.equal(pEx2.statusCode, 201, pEx2.body);
  assert.equal(pEx2.json().exchange.exchangeCreditAppliedVnd, '70000');

  // Up-exchange credit limit enforcement
  const limitedCust = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/customers`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { name: 'Khách Hạn Mức', phone: '0909998887', creditLimitVnd: 30000 },
  });
  const limCustId = limitedCust.json().customer.id;
  const limSale = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { warehouseId, customerId: limCustId, items: [{ productId: shirtA.id, quantity: 1 }], amountReceivedVnd: 100000, method: 'cash' },
  });
  const limLine = (await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${limSale.json().order.id}`, headers: ownerHeaders })).json().order.items[0];
  const limExch = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${limSale.json().order.id}/exchange`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Đổi lên áo khoác thiếu 50k vượt hạn mức 30k',
      returnItems: [{ orderLineId: limLine.id, quantity: 1 }],
      replacementItems: [{ productId: jacketB.id, quantity: 1 }],
      tenders: [],
    },
  });
  assert.equal(limExch.statusCode, 409, limExch.body);
  assert.equal(limExch.json().error.code, 'customer_credit_limit');

  // UI preview helper check
  const prev = returnsUi.computeExchangePreview({ returnTotalVnd: '100000', replacementTotalVnd: '150000' });
  assert.equal(prev.direction, 'collect');
  assert.match(returnsUi.renderExchangeSummaryHtml(prev), /50\.000/);
});
