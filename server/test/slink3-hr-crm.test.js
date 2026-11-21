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

test('Slink 3.0 Zero-Touch HR & CRM Suite: 5 Weapons (4-digit customer assistant, inline creation, 1-QR debt bundling, loyalty ledger & Margin Guard, 1-tap salary advance & payroll settlement, F8 loss-prevention radar)', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink3-hr-crm-'));
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

  // Register Owner
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      email: 'owner-slink3@example.com',
      password: 'correct horse battery staple 99',
      displayName: 'Chủ Tiệm Slink 3',
      storeName: 'Slink 3 Flagship',
    },
  });
  assert.equal(regRes.statusCode, 201, regRes.body);
  const ownerJar = extractCookies(regRes);
  const ownerHeaders = makeAuthHeaders(ownerJar);
  const storeId = regRes.json().stores[0].id;

  // Create Cashier with baseSalaryVnd = 5,200,000 (26 days -> 200,000/day), commissionRateBps = 500 (5%), pos_max_discount_pct = 10%
  const staffCreateRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/direct-create`,
    headers: ownerHeaders,
    payload: {
      email: 'cashier-slink3@example.com',
      password: 'correct horse battery staple 99',
      displayName: 'Thu Ngân Minh',
      role: 'cashier',
      jobTitle: 'Thu ngân ca sáng',
      baseSalaryVnd: '5200000',
      salaryMode: 'monthly',
      standardDaysPerMonth: 26,
      commissionRateBps: 500,
      bankBin: '970436',
      bankAccountNumber: '0123456789',
      bankAccountOwner: 'NGUYEN VAN MINH',
      permissions: { pos_max_discount_pct: 10 },
    },
  });
  assert.equal(staffCreateRes.statusCode, 201, staffCreateRes.body);
  const cashierUserId = staffCreateRes.json().member.user_id;

  const loginCashierRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'http://127.0.0.1:3000' },
    payload: {
      email: 'cashier-slink3@example.com',
      password: 'correct horse battery staple 99',
    },
  });
  assert.equal(loginCashierRes.statusCode, 200, loginCashierRes.body);
  const cashierHeaders = makeAuthHeaders(extractCookies(loginCashierRes));

  // Create 2 products:
  // P1: High-margin item (sale 300,000, cost 150,000)
  // P2: Thin-margin item (sale 100,000, cost 96,000 -> only 4% margin, to test Margin Guard when cashier tries 10% discount)
  const p1Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products`,
    headers: ownerHeaders,
    payload: { sku: 'CF-300', name: 'Cà Phê Đặc Sản 1kg', salePriceVnd: 300000, costVnd: 150000, inventoryTracked: false },
  });
  assert.equal(p1Res.statusCode, 200, p1Res.body);
  const p1 = p1Res.json().product;

  const p2Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products`,
    headers: ownerHeaders,
    payload: { sku: 'MILK-100', name: 'Sữa Tươi Hàng Phễu', salePriceVnd: 100000, costVnd: 96000, inventoryTracked: false },
  });
  assert.equal(p2Res.statusCode, 200, p2Res.body);
  const p2 = p2Res.json().product;

  // Open Cash Session by Cashier
  const openShiftRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: '1000000' },
  });
  assert.equal(openShiftRes.statusCode, 201, openShiftRes.body);
  const cashSessionId = openShiftRes.json().session.id;

  // =========================================================================
  // WEAPON 1: Inline Customer Creation ("0912345688 Chị Lan") + Debt Name Guard
  // =========================================================================
  // 1a. Debt order without explicit name ("0999111222") is blocked
  const debtNoNameRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p1.id, quantity: 1 }],
      customerInline: '0999111222',
      tenders: [{ method: 'cash', amountReceivedVnd: '100000' }],
    },
  });
  assert.equal(debtNoNameRes.statusCode, 400, debtNoNameRes.body);
  assert.equal(debtNoNameRes.json().error.code, 'customer_name_required_for_debt');

  // 1b. Debt order WITH inline name ("0912345688 Chị Lan") auto-creates customer & records 200,000 VND debt + 500,000 VND paid (earns 5 points)
  const sale1Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p1.id, quantity: 3 }], // 900,000 VND
      customerInline: '0912345688 Chị Lan',
      tenders: [{ method: 'bank_qr', amountReceivedVnd: '500000' }], // Paid 500k, owes 400k
    },
  });
  assert.equal(sale1Res.statusCode, 201, sale1Res.body);
  const sale1 = sale1Res.json().order;
  assert.ok(sale1.customerId);
  assert.equal(sale1.inlineCreatedCustomer.name, 'Chị Lan');
  assert.equal(sale1.inlineCreatedCustomer.phone, '0912345688');
  assert.equal(sale1.pointsEarned, 5); // 500,000 paid / 100,000 = 5 points
  assert.equal(sale1.dueVnd, '400000');

  // 1c. 4-digit tail lookup ("5688") on POS Customer Assistant auto-matches Chị Lan
  const assistRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/pos/customer-assistant?q=5688`,
    headers: cashierHeaders,
  });
  assert.equal(assistRes.statusCode, 200, assistRes.body);
  const assist = assistRes.json();
  assert.equal(assist.matched, true);
  assert.equal(assist.exactTailMatch, true);
  assert.equal(assist.customer.id, sale1.customerId);
  assert.equal(assist.customer.name, 'Chị Lan');
  assert.equal(assist.loyalty.pointsBalance, 5);
  assert.equal(assist.loyalty.maxRedeemVnd, '5000');
  assert.equal(assist.debt.balanceVnd, '400000');
  assert.equal(assist.debt.hasPriorDebt, true);
  assert.equal(assist.favoriteItems.length, 1);
  assert.equal(assist.favoriteItems[0].productId, p1.id);

  // 1d. 1-Tap Point Redemption + 1-QR Bundled Prior Debt Settlement on Order #2:
  // Order #2: 1 x P1 (300,000 VND)
  // Redeem 5 points (-5,000 VND) -> New order total = 295,000 VND
  // Prior debt = 400,000 VND -> Bundled QR total = 295,000 + 400,000 = 695,000 VND
  const sale2Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p1.id, quantity: 1 }],
      customerId: sale1.customerId,
      redeemPoints: true,
      settlePriorDebt: true,
      tenders: [{ method: 'bank_qr', amountReceivedVnd: '695000' }],
    },
  });
  assert.equal(sale2Res.statusCode, 201, sale2Res.body);
  const sale2 = sale2Res.json().order;
  assert.equal(sale2.pointsRedeemed, 5);
  assert.equal(sale2.pointsRedeemedVnd, '5000');
  assert.equal(sale2.totalVnd, '295000');
  assert.equal(sale2.paidVnd, '295000');
  assert.equal(sale2.dueVnd, '0');
  assert.equal(sale2.priorDebtSettledVnd, '400000');
  assert.equal(sale2.priorDebtAllocations.length, 1);
  assert.equal(sale2.priorDebtAllocations[0].orderId, sale1.id);
  assert.equal(sale2.priorDebtAllocations[0].amountVnd, '400000');
  assert.equal(sale2.pointsEarned, 2); // 295,000 paid / 100,000 = 2 points

  // Verify Chị Lan now has 0 VND debt and 2 loyalty points
  const assistAfter2 = (await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/pos/customer-assistant?customerId=${sale1.customerId}`,
    headers: cashierHeaders,
  })).json();
  assert.equal(assistAfter2.debt.balanceVnd, '0');
  assert.equal(assistAfter2.loyalty.pointsBalance, 2);

  // =========================================================================
  // WEAPON 5: Margin Guard & Point Return / Negative Point Balance Rule
  // =========================================================================
  // 5a. Cashier (10% max discount) tries 10% (10,000 VND) discount on P2 (sale 100k, cost 96k) -> Blocked by Margin Guard!
  const marginBlockedRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p2.id, quantity: 1 }],
      discountVnd: 10000,
      tenders: [{ method: 'cash', amountReceivedVnd: 90000 }],
    },
  });
  assert.equal(marginBlockedRes.statusCode, 403, marginBlockedRes.body);
  assert.equal(marginBlockedRes.json().error.code, 'margin_guard_violation');

  // Owner CAN sell below cost if needed
  const ownerBelowCostRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: p2.id, quantity: 1 }],
      discountVnd: 10000,
      tenders: [{ method: 'cash', amountReceivedVnd: 90000 }],
    },
  });
  assert.equal(ownerBelowCostRes.statusCode, 201, ownerBelowCostRes.body);

  // 5b. Return Order #1 (where Chị Lan earned 5 points that she already spent on Order #2):
  // She receives 100% of her 900,000 VND refund (no cash cut!), and her point balance goes negative (2 - 5 = -3 points)
  const order1Detail = (await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/orders/${sale1.id}`,
    headers: ownerHeaders,
  })).json().order;

  const return1Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/orders/${sale1.id}/returns`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ orderLineId: order1Detail.items[0].id, quantity: 3 }],
      reason: 'Khách đổi mẫu khác',
      restockPolicy: 'restock',
      refundMethod: 'bank_transfer',
    },
  });
  assert.equal(return1Res.statusCode, 201, return1Res.body);
  assert.equal(return1Res.json().return.refundedVnd, '900000');
  assert.equal(return1Res.json().return.pointsClawedBack, 5);

  const assistAfterReturn1 = (await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/pos/customer-assistant?customerId=${sale1.customerId}`,
    headers: cashierHeaders,
  })).json();
  assert.equal(assistAfterReturn1.loyalty.pointsBalance, -3);
  assert.equal(assistAfterReturn1.loyalty.redeemablePoints, 0);

  // =========================================================================
  // WEAPON 4: F8 Pre-bill Loss-Prevention Radar
  // =========================================================================
  const prebillRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/pos/prebill-events`,
    headers: cashierHeaders,
    payload: {
      subtotalVnd: '450000',
      expectedTotalVnd: '450000',
      lineCount: 2,
      items: [{ name: 'Cà Phê Đặc Sản 1kg', quantity: 1, unitPriceVnd: '300000' }],
    },
  });
  assert.equal(prebillRes.statusCode, 201, prebillRes.body);
  const prebillId = prebillRes.json().prebillEvent.id;

  const abandonRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/pos/prebill-events/${prebillId}/abandon`,
    headers: cashierHeaders,
    payload: {},
  });
  assert.equal(abandonRes.statusCode, 200, abandonRes.body);

  // =========================================================================
  // WEAPON 2 & 3: 1-Tap Salary Advance, Shift Shortage Waiver/Deduction & 1-Tap Payroll Settlement
  // =========================================================================
  // Close cash session with 150,000 VND shortage (expected 1,090,000 -> counted 940,000)
  const closeShiftRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/${cashSessionId}/close`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: {
      countedCashVnd: '940000',
      note: 'Thiếu 150k tiền lẻ cuối ca',
    },
  });
  assert.equal(closeShiftRes.statusCode, 201, closeShiftRes.body);

  // Owner records a 1,000,000 VND salary advance for Thu Ngân Minh
  const advRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/${cashierUserId}/advances`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      amountVnd: '1000000',
      method: 'bank_transfer',
      note: 'Ứng lương giữa tháng',
    },
  });
  assert.equal(advRes.statusCode, 201, advRes.body);
  assert.equal(advRes.json().advance.amountVnd, '1000000');

  // Check Loss Prevention Radar (Owner-only)
  const radarRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/loss-prevention-radar`,
    headers: ownerHeaders,
  });
  assert.equal(radarRes.statusCode, 200, radarRes.body);
  const radar = radarRes.json();
  assert.equal(radar.prebillAlerts.length, 1);
  assert.match(radar.prebillAlerts[0].description, /Thu Ngân Minh.*450\.000/);
  assert.equal(radar.shortageAlerts.length, 1);
  assert.equal(radar.shortageAlerts[0].shortageVnd, '150000');

  // Cashier cannot access Payroll or Loss-Prevention Radar (403 forbidden)
  const cashierPayrollForbidden = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/payroll`,
    headers: cashierHeaders,
  });
  assert.equal(cashierPayrollForbidden.statusCode, 403);

  // Owner views Payroll Sheet
  const payrollRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/payroll`,
    headers: ownerHeaders,
  });
  assert.equal(payrollRes.statusCode, 200, payrollRes.body);
  const payroll = payrollRes.json();
  const minhRow = payroll.staffPayroll.find((r) => r.userId === cashierUserId);
  assert.ok(minhRow);
  assert.equal(minhRow.activeDays, 1);
  // Net sales for Minh: Order #1 (900k) was returned in full, only Order #2 (295,000 VND) remains!
  assert.equal(minhRow.netSalesVnd, '295000');
  assert.equal(minhRow.commissionPayVnd, '14750'); // 5% of 295,000 = 14,750 VND
  assert.equal(minhRow.advanceDeductionVnd, '1000000');
  assert.equal(minhRow.shortageDeductionVnd, '150000');

  // Owner settles Minh's payroll for 26 full workdays (5,200,000 base + 14,750 commission - 1,000,000 advance - 150,000 shortage = 4,064,750 VND)
  const settleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/payroll/settle`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      userId: cashierUserId,
      periodMonth: payroll.periodMonth,
      workedUnits: 26,
      bonusVnd: '0',
      includeShortages: true,
      paymentMethod: 'bank_transfer',
      note: 'Chốt lương tháng',
    },
  });
  assert.equal(settleRes.statusCode, 201, settleRes.body);
  const payslip = settleRes.json().payslip;
  assert.equal(payslip.base_pay_vnd, '5200000');
  assert.equal(payslip.commission_pay_vnd, '14750');
  assert.equal(payslip.advance_deduction_vnd, '1000000');
  assert.equal(payslip.shortage_deduction_vnd, '150000');
  assert.equal(payslip.net_payable_vnd, '4064750');
  assert.ok(payslip.cash_movement_id);
  assert.equal(payslip.bankBin, '970436');
  assert.equal(payslip.bankAccountNumber, '0123456789');

  // Re-fetching payroll shows advanceDeductionVnd = 0 and shortageDeductionVnd = 0 (already settled, never double-deducted!)
  const payrollAfter = (await app.inject({
    method: 'GET',
    url: `/api/stores/${storeId}/payroll`,
    headers: ownerHeaders,
  })).json();
  const minhAfter = payrollAfter.staffPayroll.find((r) => r.userId === cashierUserId);
  assert.equal(minhAfter.advanceDeductionVnd, '0');
  assert.equal(minhAfter.shortageDeductionVnd, '0');
  assert.equal(minhAfter.settledPayslip.id, payslip.id);
});
