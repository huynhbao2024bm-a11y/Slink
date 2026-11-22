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

test('Slink 0.8.0: per-line POS discount, RBAC/Margin Guard, Stock Card (Thẻ kho), and Extended Analytics/EoD', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-080-'));
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
    },
  });
  t.after(async () => {
    await app.close();
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  });

  // 1. Register Owner + store
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      email: 'owner-080@example.com',
      password: 'correct horse battery staple 99',
      displayName: 'Chủ Shop 080',
      storeName: 'Slink Retail 080',
    },
  });
  assert.equal(regRes.statusCode, 201, regRes.body);
  const ownerHeaders = makeAuthHeaders(extractCookies(regRes));
  const storeId = regRes.json().stores[0].id;

  // Fetch default warehouse & create a secondary warehouse
  const whListRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: ownerHeaders });
  assert.equal(whListRes.statusCode, 200, whListRes.body);
  const mainWh = whListRes.json().warehouses.find((w) => w.is_default);
  const secWhRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/warehouses`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { code: 'KHO-B', name: 'Kho Chi Nhánh B' },
  });
  assert.equal(secWhRes.statusCode, 201, secWhRes.body);
  const secWh = secWhRes.json().warehouse;

  // 2. Direct-create Cashier (max 10% manual POS discount, no cost view), Stockkeeper (selected Kho B only),
  //    and Manager (view_reports: true, view_cost_price: false)
  const createStaff = async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/stores/${storeId}/staff/direct-create`,
      headers: ownerHeaders,
      payload,
    });
    assert.equal(res.statusCode, 201, res.body);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://127.0.0.1:3000' },
      payload: { email: payload.email, password: payload.password },
    });
    assert.equal(login.statusCode, 200, login.body);
    return { member: res.json().member, headers: makeAuthHeaders(extractCookies(login)) };
  };

  const cashier = await createStaff({
    email: 'cashier-080@example.com',
    password: 'correct horse battery staple 99',
    displayName: 'Thu Ngân An',
    role: 'cashier',
    permissions: { pos_max_discount_pct: 10 },
  });

  const stockkeeper = await createStaff({
    email: 'stock-080@example.com',
    password: 'correct horse battery staple 99',
    displayName: 'Thủ Kho Bình',
    role: 'stockkeeper',
  });
  const scopePatch = await app.inject({
    method: 'PATCH',
    url: `/api/stores/${storeId}/staff/members/${stockkeeper.member.user_id}`,
    headers: ownerHeaders,
    payload: { role: 'stockkeeper', status: 'active', warehouseScopeMode: 'selected', warehouseIds: [secWh.id] },
  });
  assert.equal(scopePatch.statusCode, 200, scopePatch.body);

  const reportViewer = await createStaff({
    email: 'report-nocost-080@example.com',
    password: 'correct horse battery staple 99',
    displayName: 'Quản Lý Ca',
    role: 'manager',
    permissions: { view_reports: true, view_cost_price: false },
  });

  // 3. Create products (import with opening stock + serial tracked item)
  const importRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/import`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [
        { sku: 'AO-POLO', name: 'Áo Polo Cotton', category: 'Thời trang', unit: 'cái', salePriceVnd: 200000, costVnd: 120000, openingQuantity: '10' },
        { sku: 'TUI-MINI', name: 'Túi Mini Canvas', category: 'Phụ kiện', unit: 'cái', salePriceVnd: 100000, costVnd: 95000, openingQuantity: '5' },
      ],
    },
  });
  assert.equal(importRes.statusCode, 201, importRes.body);
  const [polo, bag] = importRes.json().products;

  // Create a serial-tracked product to verify serialSummary in stock-card
  const serProdRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products`,
    headers: ownerHeaders,
    payload: { sku: 'TAI-NGHE', name: 'Tai Nghe Pro', category: 'Phụ kiện', unit: 'cái', salePriceVnd: 500000, costVnd: 300000, inventoryTracked: true, serialTracked: true, warrantyMonths: 12 },
  });
  assert.equal(serProdRes.statusCode, 200, serProdRes.body);
  const earProd = serProdRes.json().product;
  const receiveSer = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products/${earProd.id}/serials`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      warehouseId: mainWh.id,
      codes: ['SN-080-01', 'SN-080-02'],
    },
  });
  assert.equal(receiveSer.statusCode, 201, receiveSer.body);

  // =========================================================================
  // PART A: Per-Line POS Discount + RBAC + Margin Guard + Returns Integrity
  // =========================================================================
  // A1. Line discount exceeding line gross must fail cleanly with 400
  const overGrossRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: polo.id, quantity: 1, discountVnd: 250000 }],
      tenders: [{ method: 'cash', amountReceivedVnd: 0 }],
    },
  });
  assert.equal(overGrossRes.statusCode, 400, overGrossRes.body);

  // A2. Cashier (10% max manual discount): subtotal 500k (2x200k + 1x100k), line discounts 30k + order discount 25k = 55k (> 10% = 50k) -> 403 discount_limit_exceeded
  const overCapLineRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [
        { productId: polo.id, quantity: 2, discountVnd: 30000 },
        { productId: bag.id, quantity: 1, discountVnd: 0 },
      ],
      discountVnd: 25000,
      tenders: [{ method: 'bank_qr', amountReceivedVnd: 445000 }],
    },
  });
  assert.equal(overCapLineRes.statusCode, 403, overCapLineRes.body);
  assert.equal(overCapLineRes.json().error.code, 'discount_limit_exceeded');

  // A3. Margin Guard via line discount: bag gross 100k, cost 95k. Cashier gives 10,000 VND (10% <= 10% cap, net 90k < cost 95k) -> 403 margin_guard_violation!
  const marginBlockedLineRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: bag.id, quantity: 1, discountVnd: 10000 }],
      tenders: [{ method: 'bank_qr', amountReceivedVnd: 90000 }],
    },
  });
  assert.equal(marginBlockedLineRes.statusCode, 403, marginBlockedLineRes.body);
  assert.equal(marginBlockedLineRes.json().error.code, 'margin_guard_violation');

  // A4. Valid sale combining per-line discount + order-level discount within limits + split tenders + idempotent replay
  // 2x Polo (400k, lineDiscountVnd: 20k -> net 380k) + 1x Bag (100k, lineDiscountVnd: 2k -> net 98k)
  // subtotal = 500,000; lineDiscountTotal = 22,000; subtotalAfterLines = 478,000
  // orderDiscountVnd = 18,000 (distributed across [380k, 98k]) -> totalDiscount = 40,000 (8% <= 10%), cost = 335,000 <= total 460,000!
  const validSaleKey = randomUUID();
  const validSalePayload = {
    items: [
      { productId: polo.id, quantity: 2, discountVnd: 20000 },
      { productId: bag.id, quantity: 1, discountVnd: 2000 },
    ],
    discountVnd: 18000,
    tenders: [
      { method: 'bank_qr', amountReceivedVnd: 260000 },
      { method: 'bank_transfer', amountReceivedVnd: 200000 },
    ],
  };
  const validSaleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': validSaleKey },
    payload: validSalePayload,
  });
  assert.equal(validSaleRes.statusCode, 201, validSaleRes.body);
  const order1 = validSaleRes.json().order;
  assert.equal(order1.subtotalVnd, '500000');
  assert.equal(order1.discountVnd, '40000');
  assert.equal(order1.totalVnd, '460000');
  const sumLines = order1.items.reduce((acc, it) => acc + BigInt(it.lineTotalVnd), 0n);
  assert.equal(sumLines.toString(), '460000', 'Order line totals must sum exactly to order total');

  // Replay must return idempotent response cleanly
  const replaySaleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashier.headers, 'idempotency-key': validSaleKey },
    payload: validSalePayload,
  });
  assert.equal(replaySaleRes.statusCode, 201);
  assert.equal(replaySaleRes.headers['idempotent-replayed'], 'true');

  // Fetch order detail and verify partial return computes exact net line refund (accounting for per-line discount!)
  const orderDetailRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/orders/${order1.id}`, headers: ownerHeaders });
  assert.equal(orderDetailRes.statusCode, 200, orderDetailRes.body);
  const poloLine = orderDetailRes.json().order.items.find((l) => l.product_id === polo.id);
  const returnPoloRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${order1.id}/returns`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      reason: 'Khách đổi size',
      restockPolicy: 'restock',
      refundMethod: 'bank_transfer',
      items: [{ orderLineId: poloLine.id, quantity: 1 }],
    },
  });
  assert.equal(returnPoloRes.statusCode, 201, returnPoloRes.body);
  // Half of poloLine.line_total_vnd (which includes line discount + allocated order discount)
  const expectedHalfRefund = (BigInt(poloLine.line_total_vnd) + 1n) / 2n;
  assert.equal(returnPoloRes.json().return.refundTotalVnd, expectedHalfRefund.toString());

  // =========================================================================
  // PART B: Product Stock Card API (/products/:productId/stock-card)
  // =========================================================================
  // Transfer 3 Polo from mainWh -> secWh so both warehouses appear in stock-card
  const trRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/warehouse-transfers`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      sourceWarehouseId: mainWh.id,
      destinationWarehouseId: secWh.id,
      items: [{ productId: polo.id, quantity: 3 }],
      note: 'Điều chuyển sang Kho B',
    },
  });
  assert.equal(trRes.statusCode, 201, trRes.body);
  const transferId = trRes.json().transfer.id;
  const dispTrRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/dispatch`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {},
  });
  assert.equal(dispTrRes.statusCode, 200, dispTrRes.body);
  const trListRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouse-transfers`, headers: ownerHeaders });
  assert.equal(trListRes.statusCode, 200, trListRes.body);
  const transferLineId = trListRes.json().transfers.find((t) => t.id === transferId).lines[0].id;
  const recvTrRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/warehouse-transfers/${transferId}/receipts`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { items: [{ transferLineId, quantity: 3 }] },
  });
  assert.ok(recvTrRes.statusCode >= 200 && recvTrRes.statusCode < 300, recvTrRes.body);

  // Owner views Polo Stock Card -> sees both warehouses, costVnd, and chronological movements (opening, sale, return, transfer_out, transfer_in)
  const ownerCardRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${polo.id}/stock-card`,
    headers: ownerHeaders,
  });
  assert.equal(ownerCardRes.statusCode, 200, ownerCardRes.body);
  const ownerCard = ownerCardRes.json();
  assert.equal(ownerCard.product.costVnd, '120000');
  assert.equal(ownerCard.balancesByWarehouse.length, 2);
  const secBalance = ownerCard.balancesByWarehouse.find((b) => b.warehouseId === secWh.id);
  const mainBalance = ownerCard.balancesByWarehouse.find((b) => b.warehouseId === mainWh.id);
  assert.equal(secBalance.onHand, '3.000');
  assert.equal(mainBalance.onHand, '6.000'); // 10 - 2 sold + 1 return - 3 transferred = 6
  const moveTypes = ownerCard.movements.map((m) => m.movementType);
  assert.ok(moveTypes.includes('opening'));
  assert.ok(moveTypes.includes('sale'));
  assert.ok(moveTypes.includes('return'));
  assert.ok(moveTypes.includes('transfer_out'));
  assert.ok(moveTypes.includes('transfer_in'));
  assert.ok(ownerCard.movements.every((m) => m.unitCostVnd === '120000'));

  // Cashier views Stock Card -> unitCostVnd & product.costVnd must be masked null
  const cashierCardRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${polo.id}/stock-card`,
    headers: cashier.headers,
  });
  assert.equal(cashierCardRes.statusCode, 200, cashierCardRes.body);
  assert.equal(cashierCardRes.json().product.costVnd, null);
  assert.ok(cashierCardRes.json().movements.every((m) => m.unitCostVnd === null));

  // Selected Stockkeeper (Kho B only) -> only sees secWh balance and transfer_in movement!
  const stockCardRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${polo.id}/stock-card`,
    headers: stockkeeper.headers,
  });
  assert.equal(stockCardRes.statusCode, 200, stockCardRes.body);
  assert.deepEqual(stockCardRes.json().balancesByWarehouse.map((b) => b.warehouseId), [secWh.id]);
  assert.ok(stockCardRes.json().movements.every((m) => m.warehouseId === secWh.id));

  // Serial summary on earProd
  const earCardRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/products/${earProd.id}/stock-card`,
    headers: ownerHeaders,
  });
  assert.equal(earCardRes.statusCode, 200);
  assert.deepEqual(earCardRes.json().serialSummary, { inStockCount: 2, soldCount: 0, archivedCount: 0 });

  // =========================================================================
  // PART C: Extended Analytics & End-of-Day Breakdown
  // =========================================================================
  // Add a cash operating expense movement & make a second order so byStaff / paymentBreakdown / byCategory are rich
  const expenseRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-movements`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { direction: 'out', method: 'bank_transfer', category: 'Vận chuyển & Ship', amountVnd: '30000', includeInPnl: true, note: 'Phí giao hàng' },
  });
  assert.equal(expenseRes.statusCode, 201, expenseRes.body);

  // Validation errors on custom range
  const badHalfRange = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?from=2026-11-01`, headers: ownerHeaders });
  assert.equal(badHalfRange.statusCode, 400);
  const badOrderRange = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?from=2026-11-10&to=2026-11-01`, headers: ownerHeaders });
  assert.equal(badOrderRange.statusCode, 400);
  const tooLongRange = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?from=2025-01-01&to=2026-11-01`, headers: ownerHeaders });
  assert.equal(tooLongRange.statusCode, 400);

  // Valid custom date range matching store's current local date (derived from default analytics call)
  const defaultAnaRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/analytics?days=1`, headers: ownerHeaders });
  assert.equal(defaultAnaRes.statusCode, 200, defaultAnaRes.body);
  const todayStr = defaultAnaRes.json().range.to;

  const customAnaRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/analytics?from=${todayStr}&to=${todayStr}`,
    headers: ownerHeaders,
  });
  assert.equal(customAnaRes.statusCode, 200, customAnaRes.body);
  const ana = customAnaRes.json();
  assert.equal(ana.range.from, todayStr);
  assert.equal(ana.range.to, todayStr);
  assert.equal(ana.range.days, 1);
  assert.equal(ana.summary.orderCount, 1);
  assert.equal(ana.previousSummary.orderCount, 0);
  assert.equal(ana.previousSummary.salesGrowthPct, 100);
  assert.equal(ana.paymentBreakdown.bank_qr, '260000');
  assert.equal(ana.paymentBreakdown.bank_transfer, '200000');
  assert.equal(ana.paymentBreakdown.cash, '0');
  assert.equal(ana.endOfDay.completedOrders, 1);
  assert.equal(ana.endOfDay.returnedOrders, 1);
  assert.equal(ana.endOfDay.returnedVnd, expectedHalfRefund.toString());
  assert.ok(ana.byCategory.some((c) => c.category === 'Thời trang'));
  assert.ok(ana.byCategory.some((c) => c.category === 'Phụ kiện'));
  assert.equal(ana.byStaff.length, 1);
  assert.equal(ana.byStaff[0].name, 'Thu Ngân An');
  assert.notEqual(ana.summary.grossProfitVnd, null);

  // Report viewer WITHOUT view_cost_price must have cost/profit masked in both summary, previousSummary, and byCategory
  const maskedAnaRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/analytics?days=1`,
    headers: reportViewer.headers,
  });
  assert.equal(maskedAnaRes.statusCode, 200, maskedAnaRes.body);
  const maskedAna = maskedAnaRes.json();
  assert.equal(maskedAna.summary.grossProfitVnd, null);
  assert.equal(maskedAna.summary.netProfitVnd, null);
  assert.equal(maskedAna.previousSummary.grossProfitVnd, null);
  assert.ok(maskedAna.byCategory.every((c) => c.grossProfitVnd === null));

  // Warehouse-scoped staff with view_reports must only see analytics for their allowed warehouses (secWh has 0 orders, cash movements hidden)
  const stockReportGrant = await app.inject({
    method: 'PATCH',
    url: `/api/stores/${storeId}/staff/members/${stockkeeper.member.user_id}`,
    headers: ownerHeaders,
    payload: {
      role: 'stockkeeper',
      status: 'active',
      warehouseScopeMode: 'selected',
      warehouseIds: [secWh.id],
      permissions: { view_reports: true },
    },
  });
  assert.equal(stockReportGrant.statusCode, 200, stockReportGrant.body);
  const scopedAnaRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/analytics?days=1`,
    headers: stockkeeper.headers,
  });
  assert.equal(scopedAnaRes.statusCode, 200, scopedAnaRes.body);
  const scopedAna = scopedAnaRes.json();
  assert.equal(scopedAna.summary.orderCount, 0);
  assert.equal(scopedAna.summary.netSalesVnd, '0');
  assert.equal(scopedAna.paymentBreakdown.bank_qr, '0');
  assert.equal(scopedAna.endOfDay.returnedOrders, 0);
  assert.equal(scopedAna.endOfDay.cashOutflowVnd, '0');
  assert.equal(scopedAna.byStaff.length, 0);
});
