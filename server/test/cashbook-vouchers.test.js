'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const financeUi = require('../../finance-vouchers-ui');

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
    REVOKE DELETE, TRUNCATE ON public.cash_categories FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.cash_categories TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({ pool, logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  t.after(() => app.close());
  return { app, db };
}

async function createVerifiedUserAndStore(app, email, storeName) {
  const password = 'correct horse battery staple 89';
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email, displayName: 'Chủ Shop Quỹ', storeName, password },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  const vTok = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: vTok } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  const cookies = cookiesFrom(login);
  return {
    storeId: login.json().stores[0].id,
    userId: login.json().user.id,
    headers: {
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      origin,
      'x-csrf-token': cookies.slink_csrf,
    },
  };
}

async function inviteAndLoginStaff(app, storeId, ownerHeaders, email, role, displayName) {
  const password = 'staff secret battery staple 99';
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

test('cashbook fund separation, voucher sequences, internal transfers, immutable void reversals, payables pagination, and net profit P&L', async (t) => {
  const { app } = await setupApp(t);
  const owner = await createVerifiedUserAndStore(app, 'owner-cashbook@example.com', 'Cửa hàng Sổ Quỹ');
  const cashier = await inviteAndLoginStaff(app, owner.storeId, owner.headers, 'cashier-cb@example.com', 'cashier', 'Thu Ngân A');

  // 1. Default categories are seeded and custom category CRUD works
  const catListRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/categories`,
    headers: owner.headers,
  });
  assert.equal(catListRes.statusCode, 200, catListRes.body);
  const categories = catListRes.json().categories;
  assert.ok(categories.length >= 9, '9 default Vietnamese categories must be seeded');
  const rentCat = categories.find((c) => c.name === 'Tiền thuê mặt bằng');
  assert.ok(rentCat && rentCat.default_include_in_pnl === true);

  const customCatRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/finance/categories`,
    headers: owner.headers,
    payload: { direction: 'out', name: 'Quảng cáo Facebook', defaultIncludeInPnl: true },
  });
  assert.equal(customCatRes.statusCode, 201, customCatRes.body);
  const adsCat = customCatRes.json().category;

  const patchCatRes = await app.inject({
    method: 'PATCH',
    url: `/api/stores/${owner.storeId}/finance/categories/${adsCat.id}`,
    headers: owner.headers,
    payload: { status: 'archived' },
  });
  assert.equal(patchCatRes.statusCode, 200);
  assert.equal(patchCatRes.json().category.status, 'archived');

  // Cashier cannot view or manage categories
  const cashierCatListDenied = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/categories`,
    headers: cashier.headers,
  });
  assert.equal(cashierCatListDenied.statusCode, 403);

  const cashierCatForbidden = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/finance/categories`,
    headers: cashier.headers,
    payload: { direction: 'out', name: 'Hack cat', defaultIncludeInPnl: true },
  });
  assert.equal(cashierCatForbidden.statusCode, 403);

  const sysCatLocked = await app.inject({
    method: 'PATCH',
    url: `/api/stores/${owner.storeId}/finance/categories/${rentCat.id}`,
    headers: owner.headers,
    payload: { status: 'archived' },
  });
  assert.equal(sysCatLocked.statusCode, 409);

  // 2. Open cash drawer session with 500,000 VND
  const openShiftRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-register/open`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: '500000', note: 'Mở ca đầu ngày' },
  });
  assert.equal(openShiftRes.statusCode, 201, openShiftRes.body);

  // 3. Record bank receipt (PT-, non-P&L) & cash expense (PC-, P&L with 'other' counterparty)
  const bankInRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      direction: 'in',
      amountVnd: '1000000',
      method: 'bank_transfer',
      category: 'Góp vốn / Nạp quỹ',
      includeInPnl: false,
      note: 'Nạp vốn tài khoản',
    },
  });
  assert.equal(bankInRes.statusCode, 201, bankInRes.body);
  assert.match(bankInRes.json().movement.voucherNumber, /^PT-\d{4,}$/);
  assert.equal(bankInRes.json().movement.fundType, 'bank');

  const rentOutKey = randomUUID();
  const rentOutRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': rentOutKey },
    payload: {
      direction: 'out',
      amountVnd: '200000',
      method: 'cash',
      categoryId: rentCat.id,
      includeInPnl: true,
      counterparty: { kind: 'other', name: 'Chủ nhà A' },
      note: 'Chi trả tiền nhà',
    },
  });
  assert.equal(rentOutRes.statusCode, 201, rentOutRes.body);
  const rentOut = rentOutRes.json().movement;
  assert.match(rentOut.voucherNumber, /^PC-\d{4,}$/);
  assert.equal(rentOut.fundType, 'cash');
  assert.equal(rentOut.includeInPnl, true);
  assert.equal(rentOut.counterparty.kind, 'other');

  // Backward-compatible offline v1 payload without categoryId/includeInPnl
  const legacyInRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      _slinkOfflineVersion: 1,
      direction: 'in',
      amountVnd: 50000,
      method: 'bank_qr',
      category: 'Thu khác',
      note: 'Thu nhập ngoài hóa đơn',
    },
  });
  assert.equal(legacyInRes.statusCode, 201, legacyInRes.body);
  assert.equal(legacyInRes.json().movement.includeInPnl, true);
  assert.equal(legacyInRes.json().movement.fundType, 'bank');

  // 4. Internal cash transfer cash -> bank (drawer has 500k open? Opening float isn't a movement, wait - drawer balance is openingFloat(500k) - rentOut(200k) = 300k!)
  const overTransferRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-transfers`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { fromFund: 'cash', toFund: 'bank', amountVnd: '400000', bankMethod: 'bank_transfer', note: 'Quá số dư két' },
  });
  assert.equal(overTransferRes.statusCode, 409, 'Cash overdraft in transfer must return 409');

  const xferKey = randomUUID();
  const xferRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-transfers`,
    headers: { ...owner.headers, 'idempotency-key': xferKey },
    payload: { fromFund: 'cash', toFund: 'bank', amountVnd: '100000', bankMethod: 'bank_transfer', note: 'Nộp quỹ cuối ngày' },
  });
  assert.equal(xferRes.statusCode, 201, xferRes.body);
  const transfer = xferRes.json().transfer;
  assert.match(transfer.voucherNumber, /^CQ-\d{4,}$/);
  assert.equal(transfer.movements.length, 2);

  // Idempotency replay on transfer must return exact same transfer without duplicating rows
  const xferReplay = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-transfers`,
    headers: { ...owner.headers, 'idempotency-key': xferKey },
    payload: { fromFund: 'cash', toFund: 'bank', amountVnd: '100000', bankMethod: 'bank_transfer', note: 'Nộp quỹ cuối ngày' },
  });
  assert.equal(xferReplay.statusCode, 201);
  assert.equal(xferReplay.json().transfer.id, transfer.id);

  // 5. Cashbook fund balances check (all excludes transfers!)
  const cbRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/cashbook`,
    headers: owner.headers,
  });
  assert.equal(cbRes.statusCode, 200, cbRes.body);
  const { balances } = cbRes.json();
  assert.equal(balances.all.inVnd, '1050000'); // bank 1,000,000 + bank_qr 50,000 (transfer excluded!)
  assert.equal(balances.all.outVnd, '200000'); // cash rent 200,000 (transfer excluded!)
  assert.equal(balances.all.closingVnd, '850000');
  assert.equal(balances.cash.outVnd, '300000'); // rent 200k + xfer out 100k
  assert.equal(balances.bank.inVnd, '1150000'); // 1,000k + 50k + xfer in 100k
  assert.equal(
    BigInt(balances.cash.closingVnd) + BigInt(balances.bank.closingVnd),
    BigInt(balances.all.closingVnd),
    'Sum of cash + bank closing must equal consolidated all closing',
  );

  // Cashier sees cash only, bank is hidden/403
  const cashierCb = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/cashbook`,
    headers: cashier.headers,
  });
  assert.equal(cashierCb.statusCode, 200);
  assert.equal(cashierCb.json().balances.bank, null);
  const cashierBankDenied = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/cashbook?fund=bank`,
    headers: cashier.headers,
  });
  assert.equal(cashierBankDenied.statusCode, 403);

  // 6. Analytics Net Profit P&L check before void
  const anBeforeRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/analytics?days=7`,
    headers: owner.headers,
  });
  assert.equal(anBeforeRes.statusCode, 200, anBeforeRes.body);
  const anBefore = anBeforeRes.json();
  assert.equal(anBefore.summary.otherIncomeVnd, '50000');
  assert.equal(anBefore.summary.operatingExpenseVnd, '200000');
  assert.equal(anBefore.summary.netProfitVnd, '-150000');
  assert.equal(anBefore.expenseBreakdown[0].category, 'Tiền thuê mặt bằng');
  assert.equal(anBefore.expenseBreakdown[0].amountVnd, '200000');

  // 7. Immutable void reversal on rent expense + idempotency + double void block + P&L cancellation
  const voidKey = randomUUID();
  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements/${rentOut.movementId}/void`,
    headers: { ...owner.headers, 'idempotency-key': voidKey },
    payload: { reason: 'Nhập sai phiếu chi tiền nhà' },
  });
  assert.equal(voidRes.statusCode, 201, voidRes.body);
  assert.match(voidRes.json().reversals[0].voucherNumber, /^HUY-/);

  const voidReplay = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements/${rentOut.movementId}/void`,
    headers: { ...owner.headers, 'idempotency-key': voidKey },
    payload: { reason: 'Nhập sai phiếu chi tiền nhà' },
  });
  assert.equal(voidReplay.statusCode, 201);

  const doubleVoid = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements/${rentOut.movementId}/void`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { reason: 'Hủy lần 2' },
  });
  assert.equal(doubleVoid.statusCode, 409, 'Double void must fail with 409');

  // Voiding the internal transfer reverses both cash and bank legs
  const voidXferRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements/${transfer.movements[0]}/void`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { reason: 'Hủy chuyển quỹ test' },
  });
  assert.equal(voidXferRes.statusCode, 201, voidXferRes.body);
  assert.equal(voidXferRes.json().reversals.length, 2, 'Voiding transfer must reverse both legs');

  const cbAfterVoidXfer = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/cashbook`,
    headers: owner.headers,
  });
  assert.equal(cbAfterVoidXfer.statusCode, 200);
  assert.equal(cbAfterVoidXfer.json().balances.all.inVnd, '1250000', 'Transfer reversals must not inflate consolidated inVnd (1,050k + 200k rent reversal)');
  assert.equal(cbAfterVoidXfer.json().balances.all.outVnd, '200000', 'Transfer reversals must not inflate consolidated outVnd');

  const anAfterRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/analytics?days=7`,
    headers: owner.headers,
  });
  assert.equal(anAfterRes.statusCode, 200);
  const anAfter = anAfterRes.json();
  assert.equal(anAfter.summary.otherIncomeVnd, '50000');
  assert.equal(anAfter.summary.operatingExpenseVnd, '0', 'Voided operating expense must net to 0');
  assert.equal(anAfter.summary.netProfitVnd, '50000');
  assert.equal(anAfter.expenseBreakdown.length, 0);

  // 8. Linked sale payment movement cannot be voided directly via manual cash-movements/:id/void
  const prodRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/products`,
    headers: owner.headers,
    payload: { sku: 'SP-CB', name: 'Nước suối', category: 'Đồ uống', unit: 'chai', salePriceVnd: 20000, costVnd: 10000, lowStockThreshold: 1, inventoryTracked: false },
  });
  const product = prodRes.json().product;
  const saleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId: product.id, quantity: 1 }],
      tenders: [{ method: 'cash', amountReceivedVnd: '20000' }],
    },
  });
  assert.equal(saleRes.statusCode, 201, saleRes.body);

  const cbSearchRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/cashbook?q=${encodeURIComponent('Bán hàng')}`,
    headers: owner.headers,
  });
  assert.equal(cbSearchRes.statusCode, 200);
  const orderMovement = cbSearchRes.json().movements.find((m) => m.source_type === 'order_payment');
  assert.ok(orderMovement, 'Order payment cash movement must appear in cashbook search');
  const linkedVoidDenied = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements/${orderMovement.movement_id}/void`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { reason: 'Cố tình hủy chứng từ đơn hàng' },
  });
  assert.equal(linkedVoidDenied.statusCode, 409);

  // 9. Payables search & pagination
  const supA = await app.inject({ method: 'POST', url: `/api/stores/${owner.storeId}/suppliers`, headers: { ...owner.headers, 'idempotency-key': randomUUID() }, payload: { name: 'NCC Ánh Dương' } });
  const supB = await app.inject({ method: 'POST', url: `/api/stores/${owner.storeId}/suppliers`, headers: { ...owner.headers, 'idempotency-key': randomUUID() }, payload: { name: 'NCC Bình Minh' } });
  assert.equal(supA.statusCode, 201, supA.body);
  assert.equal(supB.statusCode, 201, supB.body);
  const whRes = await app.inject({ method: 'GET', url: `/api/stores/${owner.storeId}/warehouses`, headers: owner.headers });
  const whId = whRes.json().warehouses[0].id;
  const purchaseDebt = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/purchases`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      supplierId: supA.json().supplier.id,
      warehouseId: whId,
      items: [{ productId: product.id, quantity: 5, unitCostVnd: '10000' }],
      amountPaidVnd: '10000',
      method: 'bank_transfer',
    },
  });
  assert.equal(purchaseDebt.statusCode, 201, purchaseDebt.body);

  const payRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/payables?onlyOwing=true&q=${encodeURIComponent('Ánh')}`,
    headers: owner.headers,
  });
  assert.equal(payRes.statusCode, 200, payRes.body);
  assert.equal(payRes.json().suppliers.length, 1);
  assert.equal(payRes.json().suppliers[0].balanceVnd, '40000');
  assert.equal(payRes.json().totalPayableVnd, '40000');

  const payOutOfRangeRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/finance/payables?onlyOwing=true&q=${encodeURIComponent('KhongTonTai')}&offset=50`,
    headers: owner.headers,
  });
  assert.equal(payOutOfRangeRes.statusCode, 200);
  assert.equal(payOutOfRangeRes.json().suppliers.length, 0);
  assert.equal(payOutOfRangeRes.json().totalPayableVnd, '40000', 'Global totalPayableVnd must not drop on filtered/empty pages');

  // 10. UI helper escaping check
  const html = financeUi.renderVouchersPanel({
    cashbookState: { ready: true, rows: [{ movement_id: '1', voucher_number: '<script>', direction: 'out', source_type: 'manual_cash_movement', movement_kind: 'standard', category: 'Test <b>', amount_vnd: '50000', method: 'cash', fund_type: 'cash', occurred_at: new Date().toISOString() }] },
    fallbackRows: [],
    canRecord: true,
    humanDate: (v) => String(v),
  });
  assert.ok(!html.includes('<script>'), 'XSS script tags must be escaped in SlinkFinanceUI');
});
