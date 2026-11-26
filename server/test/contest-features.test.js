'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const ExcelJS = require('exceljs');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const rootDirectory = path.join(__dirname, '..', '..');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : (response.headers['set-cookie'] ? [response.headers['set-cookie']] : []);
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

async function setupApp(t, { aiClient = null, extraEnv = {} } = {}) {
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
    aiClient,
    env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin, ...extraEnv },
  });
  app.testDb = db;
  t.after(() => app.close());
  return { app, db };
}

async function registerUser(app, email, storeName) {
  const password = 'VeryStrongPassword#2026!';
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin },
    payload: {
      email,
      password,
      displayName: 'Chủ Hộ Kinh Doanh',
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
  return {
    userId: body.user.id,
    storeId: body.stores[0].id,
    headers: {
      origin,
      cookie: `slink_session=${cookies.slink_session}; slink_csrf=${cookies.slink_csrf}`,
      'x-csrf-token': cookies.slink_csrf,
    },
  };
}

function vnTodayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

test('TT 152/2025/TT-BTC Excel export builds 2 sheets with integer VND, taxCode, formula protection, and RBAC', async (t) => {
  const { app } = await setupApp(t);
  const owner = await registerUser(app, 'tt152-owner@slink.test', 'Tạp Hóa Minh Tâm');
  const other = await registerUser(app, 'tt152-other@slink.test', 'Shop Khác');

  const settingsRes = await app.inject({
    method: 'PUT',
    url: `/api/stores/${owner.storeId}/integrations/settings`,
    headers: owner.headers,
    payload: {
      bankBin: '970436',
      bankAccountNumber: '0123456789',
      bankAccountName: 'MINH TAM',
      taxCode: '8421009988',
    },
  });
  assert.equal(settingsRes.statusCode, 200, settingsRes.body);

  const prodRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/products`,
    headers: owner.headers,
    payload: {
      sku: 'TS01',
      name: 'Trà sữa trân châu',
      category: 'Đồ uống',
      unit: 'Ly',
      salePriceVnd: 35000,
      costVnd: 15000,
      lowStockThreshold: 1,
      inventoryTracked: false,
    },
  });
  assert.equal(prodRes.statusCode, 200, prodRes.body);
  const productId = prodRes.json().product.id;

  const custRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/customers`,
    headers: owner.headers,
    payload: { name: 'Anh Hùng', phone: '0909123456' },
  });
  assert.ok([200, 201].includes(custRes.statusCode), custRes.body);
  const customerId = custRes.json().customer.id;

  const saleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      items: [{ productId, quantity: 2 }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: 70000 }],
      note: '=SUM(A1:A2) Khach chuyen khoan',
    },
  });
  assert.equal(saleRes.statusCode, 201, saleRes.body);

  // Create and void an unpaid order so export excludes voided sales
  const voidSaleRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/sales`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      customerId,
      items: [{ productId, quantity: 1 }],
      tenders: [],
      method: 'cash',
      amountReceivedVnd: 0,
    },
  });
  assert.equal(voidSaleRes.statusCode, 201, voidSaleRes.body);
  const voidOrderId = voidSaleRes.json().order.id;
  const voidRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/orders/${voidOrderId}/void`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { reason: 'Hủy kiểm thử', stockConfirmed: true },
  });
  assert.equal(voidRes.statusCode, 200, voidRes.body);

  // Open cash register before recording cash movement
  const openShiftRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-register/open`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: '0', note: 'Mở ca kiểm thử' },
  });
  assert.equal(openShiftRes.statusCode, 201, openShiftRes.body);

  // Add manual bank expense voucher (store bank balance is 70,000 VND from the transfer sale)
  const cashRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/cash-movements`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: {
      direction: 'out',
      method: 'bank_transfer',
      category: 'Mua đá viên',
      amountVnd: '20000',
      note: 'Chi chuyển khoản',
    },
  });
  assert.equal(cashRes.statusCode, 201, cashRes.body);

  // Cross-tenant attempt must fail with 403/404
  const crossRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/exports/accounting-tt152.xlsx`,
    headers: other.headers,
  });
  assert.ok([403, 404].includes(crossRes.statusCode), `Unexpected cross-tenant status ${crossRes.statusCode}`);

  // Cashier without view_reports must get 403
  const cashierRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/staff/direct-create`,
    headers: owner.headers,
    payload: {
      email: 'tt152-cashier@slink.test',
      password: 'VeryStrongPassword#2026!',
      displayName: 'Thu ngân',
      role: 'cashier',
    },
  });
  assert.equal(cashierRes.statusCode, 201, cashierRes.body);
  const cashierLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'tt152-cashier@slink.test', password: 'VeryStrongPassword#2026!' },
  });
  assert.equal(cashierLogin.statusCode, 200, cashierLogin.body);
  const cashierCookies = cookiesFrom(cashierLogin);
  const cashierExport = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/exports/accounting-tt152.xlsx`,
    headers: {
      origin,
      cookie: `slink_session=${cashierCookies.slink_session}; slink_csrf=${cashierCookies.slink_csrf}`,
    },
  });
  assert.equal(cashierExport.statusCode, 403);

  const today = vnTodayYmd();
  const exportRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/exports/accounting-tt152.xlsx?from=${today}&to=${today}`,
    headers: owner.headers,
  });
  assert.equal(exportRes.statusCode, 200, exportRes.body);
  assert.match(exportRes.headers['content-type'], /spreadsheetml/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exportRes.rawPayload);
  const ws1 = wb.getWorksheet('So_Doanh_Thu_TT152');
  const ws2 = wb.getWorksheet('So_Quy_Thu_Chi');
  assert.ok(ws1, 'Missing So_Doanh_Thu_TT152 worksheet');
  assert.ok(ws2, 'Missing So_Quy_Thu_Chi worksheet');

  const sheet1Text = [];
  ws1.eachRow((row) => sheet1Text.push(row.values.map((v) => String(v || '')).join(' | ')));
  const joined1 = sheet1Text.join('\n');
  assert.match(joined1, /Mẫu số: S1-HKD/);
  assert.match(joined1, /152\/2025\/TT-BTC/);
  assert.match(joined1, /8421009988/);
  assert.match(joined1, /'=SUM\(A1:A2\)/);
  assert.match(joined1, /TỔNG CỘNG DOANH THU TRONG KỲ \| 70000 \| 1 chứng từ/);

  const sheet2Text = [];
  ws2.eachRow((row) => sheet2Text.push(row.values.map((v) => String(v || '')).join(' | ')));
  const joined2 = sheet2Text.join('\n');
  assert.match(joined2, /70000/);
  assert.match(joined2, /20000/);
  assert.match(joined2, /Chênh lệch: 50\.000 đ/);
});

test('Gemini AI Assistant grounds parse-order & parse-invoice against DB catalog and enforces CSRF & RBAC', async (t) => {
  let seenInvoiceMime = null;
  const mockAiClient = {
    async parseOrder() {
      return {
        items: [
          { product_id: 'fake-id-999', matched_name: 'Cà phê sữa đá', quantity: 2, sale_price_vnd: 1 },
          { product_id: '00000000-0000-0000-0000-000000000000', matched_name: 'Món Không Tồn Tại', quantity: 3 },
        ],
        customer_id: '',
        customer_name: 'Chị Hoa',
        is_debt: true,
        note: 'Ít đường',
      };
    },
    async parseInvoice({ mimeType }) {
      seenInvoiceMime = mimeType;
      return {
        supplier_name: 'Nhà phân phối An Bình',
        items: [
          { matched_name: 'Cà phê sữa đá', quantity: 10, import_price_vnd: 14500 },
          { product_name: 'Ly nhựa không có trong kho', quantity: 100, import_price_vnd: 500 },
        ],
      };
    },
  };

  const { app } = await setupApp(t, { aiClient: mockAiClient });
  const owner = await registerUser(app, 'ai-owner@slink.test', 'Quán Cà Phê AI');

  const prod = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/products`,
    headers: owner.headers,
    payload: {
      sku: 'CF01',
      name: 'Cà phê sữa đá',
      unit: 'Ly',
      salePriceVnd: 29000,
      costVnd: 12000,
      lowStockThreshold: 1,
      inventoryTracked: false,
    },
  });
  assert.ok([200, 201].includes(prod.statusCode), prod.body);
  const realProductId = prod.json().product.id;

  const cust = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/customers`,
    headers: owner.headers,
    payload: { name: 'Chị Hoa', phone: '0908111222' },
  });
  assert.ok([200, 201].includes(cust.statusCode), cust.body);
  const realCustomerId = cust.json().customer.id;

  const sup = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/suppliers`,
    headers: { ...owner.headers, 'idempotency-key': randomUUID() },
    payload: { name: 'Nhà phân phối An Bình' },
  });
  assert.ok([200, 201].includes(sup.statusCode), sup.body);
  const realSupplierId = sup.json().supplier.id;

  const statusRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/ai/status`,
    headers: owner.headers,
  });
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.json().enabled, true);

  // Missing CSRF must fail with 403
  const noCsrf = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-order`,
    headers: { origin, cookie: owner.headers.cookie },
    payload: { transcript: 'Bán 2 ly cà phê sữa đá cho chị Hoa ghi nợ' },
  });
  assert.equal(noCsrf.statusCode, 403);

  const orderRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-order`,
    headers: owner.headers,
    payload: { transcript: 'Bán 2 ly cà phê sữa đá cho chị Hoa ghi nợ' },
  });
  assert.equal(orderRes.statusCode, 200, orderRes.body);
  const orderBody = orderRes.json();
  assert.equal(orderBody.items.length, 1);
  assert.equal(orderBody.items[0].productId, realProductId);
  assert.equal(orderBody.items[0].salePriceVnd, '29000');
  assert.equal(orderBody.items[0].quantity, '2');
  assert.equal(orderBody.unmatched.length, 1);
  assert.equal(orderBody.unmatched[0].name, 'Món Không Tồn Tại');
  assert.equal(orderBody.customerId, realCustomerId);
  assert.equal(orderBody.isDebt, true);

  const fakeBase64 = Buffer.from('fake-jpeg-binary-data-for-invoice-ocr-testing-payload-1234567890'.repeat(4)).toString('base64');
  const invRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-invoice`,
    headers: owner.headers,
    payload: { mimeType: 'image/jpeg', imageBase64: fakeBase64 },
  });
  assert.equal(invRes.statusCode, 200, invRes.body);
  assert.equal(seenInvoiceMime, 'image/jpeg');
  const invBody = invRes.json();
  assert.equal(invBody.supplierId, realSupplierId);
  assert.equal(invBody.items.length, 1);
  assert.equal(invBody.items[0].productId, realProductId);
  assert.equal(invBody.items[0].unitCostVnd, '14500');
  assert.equal(invBody.unmatched.length, 1);

  const badMime = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-invoice`,
    headers: owner.headers,
    payload: { mimeType: 'image/svg+xml', imageBase64: fakeBase64 },
  });
  assert.equal(badMime.statusCode, 400);

  // Cashier without edit_products / record_cashbook must be denied on parse-invoice (403)
  const cashierRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/staff/direct-create`,
    headers: owner.headers,
    payload: {
      email: 'ai-cashier@slink.test',
      password: 'VeryStrongPassword#2026!',
      displayName: 'Thu ngân AI',
      role: 'cashier',
    },
  });
  assert.equal(cashierRes.statusCode, 201, cashierRes.body);
  const cashierLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin },
    payload: { email: 'ai-cashier@slink.test', password: 'VeryStrongPassword#2026!' },
  });
  assert.equal(cashierLogin.statusCode, 200, cashierLogin.body);
  const cashierCookies = cookiesFrom(cashierLogin);
  const cashierInv = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-invoice`,
    headers: {
      origin,
      cookie: `slink_session=${cashierCookies.slink_session}; slink_csrf=${cashierCookies.slink_csrf}`,
      'x-csrf-token': cashierCookies.slink_csrf,
    },
    payload: { mimeType: 'image/jpeg', imageBase64: fakeBase64 },
  });
  assert.equal(cashierInv.statusCode, 403);
});

test('Gemini AI returns 503 ai_unavailable when GEMINI_API_KEY is not configured', async (t) => {
  const { app } = await setupApp(t);
  const owner = await registerUser(app, 'ai-unconfigured@slink.test', 'Quán Test');

  const statusRes = await app.inject({
    method: 'GET',
    url: `/api/stores/${owner.storeId}/ai/status`,
    headers: owner.headers,
  });
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.json().enabled, false);

  const res = await app.inject({
    method: 'POST',
    url: `/api/stores/${owner.storeId}/ai/parse-order`,
    headers: owner.headers,
    payload: { transcript: 'Bán 1 nước suối' },
  });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error?.code, 'ai_unavailable');
});

test('UI renders offline NAPAS VietQR and hides all third-party provider integrations', async () => {
  const uiModule = require('../../integrations-ui.js');
  const settingsHtml = uiModule.renderIntegrationSettingsSection({
    loading: false,
    error: '',
    canEdit: true,
    data: {
      settings: {
        bankBin: '970436',
        bankAccountNumber: '0123456789',
        bankAccountName: 'NGUYEN VAN A',
        taxCode: '0109998887',
      },
      connectors: [],
    },
  });

  assert.match(settingsHtml, /name='taxCode'/);
  assert.match(settingsHtml, /id='int-vietqr-preview'/);
  assert.doesNotMatch(settingsHtml, /Kết nối đối tác|MoMo|VNPAY|Giao Hàng Nhanh|Giao Hàng Tiết Kiệm|Viettel Post|Shopee|TikTok|Hóa đơn điện tử|Casso|SePay/);

  const orderHtml = uiModule.renderOrderIntegrationSection({
    order: { id: 'ord-1', number: 'HD001', due: 50000, rawStatus: 'completed' },
    settings: {
      bankBin: '970436',
      bankAccountNumber: '0123456789',
      momoConfigured: true,
      vnpayConfigured: true,
      einvoiceProvider: 'misa',
      shippingProvider: 'ghn',
    },
    role: 'owner',
    canOperate: true,
  });

  assert.match(orderHtml, /data-action='open-order-vietqr'/);
  assert.doesNotMatch(orderHtml, /MoMo|VNPAY|Xuất HĐĐT|Tạo vận đơn/);

  const swSource = await readFile(path.join(rootDirectory, 'sw.js'), 'utf8');
  assert.match(swSource, /new URL\(file, self\.location\.href\)\.pathname === cleanPathname/);
});
