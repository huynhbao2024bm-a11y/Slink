'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { buildServer } = require('../server');
const { openPGliteRuntime } = require('../server/pglite-runtime');

function loadPlaywright() {
  const localTools = 'D:\\Slink\\.local-data\\ui-check-tools\\node_modules\\playwright';
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = 'D:\\Slink\\.local-data\\playwright-browsers';
  }
  try { return require('playwright'); } catch { return require(localTools); }
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function bootTempApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slink-e2e-'));
  const port = await pickFreePort();
  const origin = `http://127.0.0.1:${port}`;
  const runtime = await openPGliteRuntime({
    dataDirectory: dataDir,
    migrationsDirectory: path.join(__dirname, '..', 'server', 'migrations'),
  });
  const env = {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: origin,
    DEMO_DISABLE_EMAIL_VERIFICATION: 'true',
  };
  const app = await buildServer({ pool: runtime.pool, logger: false, env });
  await app.listen({ port, host: '127.0.0.1' });
  return {
    origin,
    async close() {
      await app.close();
      await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

async function assertNoHorizontalOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert.ok(
    dims.scrollWidth <= dims.innerWidth + 1,
    `${label}: horizontal overflow ${dims.scrollWidth} > ${dims.innerWidth}`
  );
}

async function registerOwnerInBrowser(page, origin) {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await assertNoHorizontalOverflow(page, 'auth-login');

  await page.click("[data-action='auth-mode'][data-mode='register']");
  await page.waitForSelector("form[data-auth-form='register']");
  await assertNoHorizontalOverflow(page, 'auth-register');

  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  await page.fill("form[data-auth-form='register'] input[name='displayName']", 'Chủ Tiệm E2E');
  await page.fill("form[data-auth-form='register'] input[name='storeName']", 'Tiệm Cà Phê E2E');
  await page.fill("form[data-auth-form='register'] input[name='email']", email);
  await page.fill("form[data-auth-form='register'] input[name='password']", 'correct horse battery staple 77');
  await page.fill("form[data-auth-form='register'] input[name='passwordConfirm']", 'correct horse battery staple 77');
  await page.click("form[data-auth-form='register'] button[type='submit']");

  await page.waitForFunction(() => !document.querySelector('.app-shell')?.hasAttribute('hidden'));
  await page.waitForTimeout(300);

  // Select a business profile option and confirm onboarding modal if visible
  const onboardingSubmit = page.locator("button[form='business-profile-onboarding']");
  if (await onboardingSubmit.isVisible()) {
    await page.locator('.business-profile-choices .business-profile-choice').first().click();
    await onboardingSubmit.click();
    await page.waitForSelector('#modal[hidden]', { state: 'attached' });
  }
  return { email };
}

async function seedProductsAndCashViaBrowserSession(page) {
  return page.evaluate(async () => {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('slink_csrf='))?.split('=')[1] || '';
    const me = await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json();
    const storeId = me.stores[0].id;
    const wh = await (await fetch(`/api/stores/${storeId}/warehouses`, { credentials: 'same-origin' })).json();
    const warehouseId = wh.warehouses[0].id;

    const createProd = async (sku, barcode, name, salePriceVnd, costVnd) => {
      const r = await fetch(`/api/stores/${storeId}/products`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ sku, barcode, name, category: 'Đồ uống', unit: 'ly', salePriceVnd, costVnd, lowStockThreshold: 2, inventoryTracked: true }),
      });
      if (!r.ok) throw new Error(`Product create failed: ${r.status}`);
      return (await r.json()).product;
    };
    const p1 = await createProd('CF-01', '8938505974194', 'Cà phê đá E2E', 35000, 12000);
    const p2 = await createProd('TR-01', '2000000000122', 'Trà đào cam sả', 45000, 15000);

    const purRes = await fetch(`/api/stores/${storeId}/purchases`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        warehouseId,
        supplierName: 'Nhà Rang Xay Slink',
        items: [
          { productId: p1.id, quantity: 20, unitCostVnd: 12000 },
          { productId: p2.id, quantity: 10, unitCostVnd: 15000 },
        ],
        amountPaidVnd: 390000,
        method: 'bank_transfer',
      }),
    });
    if (!purRes.ok) throw new Error(`Purchase failed: ${purRes.status}`);
    const supId = (await (await fetch(`/api/stores/${storeId}/purchase-suppliers`, { credentials: 'same-origin' })).json()).suppliers[0].id;

    const shiftRes = await fetch(`/api/stores/${storeId}/cash-register/open`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ openingFloatVnd: 500000 }),
    });
    if (!shiftRes.ok) throw new Error(`Shift open failed: ${shiftRes.status}`);

    // Keep the delivery customer outside the finance summary's top-ten debtors.
    // The receivables page must still open and remind customers found by search.
    for (let index = 0; index < 10; index += 1) {
      const debtorRes = await fetch(`/api/stores/${storeId}/customers`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ name: `Khách nợ kiểm thử ${index + 1}`, openingBalanceVnd: '1000000' }),
      });
      if (!debtorRes.ok) throw new Error(`Debtor create failed: ${debtorRes.status}`);
    }

    const srRes = await fetch(`/api/stores/${storeId}/supplier-returns`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        supplierId: supId,
        warehouseId,
        items: [{ productId: p1.id, quantity: 2 }],
        refundReceivedVnd: 24000,
        refundMethod: 'cash',
        reason: 'Kiểm thử E2E trả NCC',
      }),
    });
    if (!srRes.ok) throw new Error(`Supplier return failed: ${srRes.status}`);

    return { storeId, warehouseId, p1Id: p1.id, p2Id: p2.id };
  });
}

async function runViewportAudit(browser, origin, viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const serverErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (res) => { if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`); });

  try {
    await registerOwnerInBrowser(page, origin);
    // Reset pre-login initial /api/auth/me 401 probe noise; enforce zero errors post-login
    consoleErrors.length = 0;
    pageErrors.length = 0;
    serverErrors.length = 0;
    const seeded = await seedProductsAndCashViaBrowserSession(page);
    await page.reload({ waitUntil: 'networkidle' });
    const skipTour = async () => {
      const btn = page.locator("[data-action='guided-tour-skip']:visible").first();
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(150); }
    };
    await skipTour();

    for (const route of ['dashboard', 'products', 'inventory', 'orders', 'workspace']) {
      await skipTour();
      const btn = page.locator(`[data-route='${route}']:visible`).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(250);
        await skipTour();
        await assertNoHorizontalOverflow(page, `${label}:${route}`);
      }
    }

    // 1. Verify separated topbar Bán hàng CTA for Owner
    const topbarPos = page.locator('#topbar-pos-cta:visible');
    assert.equal(await topbarPos.count(), 1, `${label}: #topbar-pos-cta must be visible for owner`);
    await topbarPos.click();
    await page.waitForSelector('.pos-product-grid button');
    await assertNoHorizontalOverflow(page, `${label}:pos-topbar`);

    // 2. Hardware barcode Enter auto-add on #pos-search
    await page.fill('#pos-search', '8938505974194');
    await page.press('#pos-search', 'Enter');
    await page.waitForTimeout(250);

    // 3. Test Bán nhanh (1-tap sale without modal)
    await page.locator("[data-action='pos-mode'][data-mode='fast']").click();
    await page.waitForTimeout(150);
    await assertNoHorizontalOverflow(page, `${label}:pos-fast`);
    if (await page.locator(".pos-layout > .cart-panel [data-action='fast-pay'][data-method='cash']").isVisible()) {
      await page.locator(".pos-layout > .cart-panel [data-action='fast-pay'][data-method='cash']").click();
    } else {
      await page.locator(".pos-mobile-checkout[data-action='fast-pay']").click();
    }
    await page.waitForSelector('.sale-saved');

    // 4. Test Bán giao hàng (real delivery order + customer creation)
    await page.locator("[data-action='pos-mode'][data-mode='delivery']").click();
    await page.locator('.pos-product-grid button').first().click();
    await page.waitForTimeout(150);
    let deliverySubmitSelector;
    if (!(await page.locator(".pos-layout > .cart-panel [data-delivery-field='receiverName']").isVisible())) {
      await page.locator("[data-action='open-cart']:visible").first().click();
      await page.waitForSelector("#drawer-cart.open [data-delivery-field='receiverName']");
      await page.fill("#drawer-cart [data-delivery-field='receiverName']", 'Khách Giao Hàng E2E');
      await page.fill("#drawer-cart [data-delivery-field='receiverPhone']", '0901234567');
      await page.fill("#drawer-cart [data-delivery-field='address']", '12 Nguyễn Huệ, Q1');
      deliverySubmitSelector = "#drawer-cart [data-action='submit-delivery-sale']";
    } else {
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='receiverName']", 'Khách Giao Hàng E2E');
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='receiverPhone']", '0901234567');
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='address']", '12 Nguyễn Huệ, Q1');
      deliverySubmitSelector = ".pos-layout > .cart-panel [data-action='submit-delivery-sale']";
    }
    const [deliveryRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/sales') && res.request().method() === 'POST'),
      page.locator(deliverySubmitSelector).click(),
    ]);
    assert.equal(deliveryRes.status(), 201, `${label}: delivery order POST /sales must succeed with 201`);
    await page.waitForSelector('.sale-saved');
    await assertNoHorizontalOverflow(page, `${label}:pos-delivery-after`);

    // 5. Switch to Hàng hóa: test prominent barcode on quick product + Lưu & in tem + CSV import auto-barcode + print modal
    await page.locator("#primary-nav [data-route='products']:visible, #mobile-nav [data-route='products']:visible").first().click();
    await page.waitForSelector("[data-action='new-product']:visible");
    await page.locator("[data-action='new-product']:visible").first().click();
    await page.waitForSelector(".modal:not([hidden]) #product-barcode");
    assert.equal(await page.locator(".modal #product-barcode").isVisible(), true, `${label}: #product-barcode must be immediately visible`);
    await page.fill(".modal [name='name']", 'Trà sữa E2E');
    await page.fill(".modal [name='price']", '38000');
    await page.locator(".modal [data-action='generate-product-barcode']").click();
    const generatedQuickCode = await page.locator(".modal #product-barcode").inputValue();
    assert.match(generatedQuickCode, /^\d{13}$/, `${label}: generated quick-product barcode must be 13-digit EAN-13`);
    await page.waitForSelector(".modal [data-barcode-field-preview] svg.barcode-svg");
    await assertNoHorizontalOverflow(page, `${label}:quick-product-barcode`);
    const [quickSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/products/import') && !res.url().includes('/preview') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][data-print-after='true']").click(),
    ]);
    assert.equal(quickSaveRes.status(), 201, `${label}: Lưu & in tem must save with 201`);
    await page.waitForSelector(".modal:not([hidden]) [data-form='barcode-print'] [data-barcode-sheet-preview] svg.barcode-svg");
    await page.locator(".modal [data-action='close-modal']").first().click();
    await page.waitForSelector('#modal[hidden]', { state: 'attached' });
    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.SLINK_E2E_SCREENSHOT_DIR, { recursive: true });
      await page.locator('.toast').first().waitFor({ state: 'hidden' });
      await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-products.png`) });
    }

    if (viewport.width <= 640) {
      const card = page.locator('.product-mobile-card').filter({ hasText: 'Trà sữa E2E' });
      await card.locator('[data-action="product-card-menu"]').click();
      assert.equal(await page.locator('.modal [data-action="product-card-choice"]').count(), 4, `${label}: one card menu exposes four non-overlapping actions`);
      await page.locator('.modal [data-action="close-modal"]').click();
      await page.waitForSelector('#modal[hidden]', { state: 'attached' });
      await page.locator('.product-secondary-actions summary').click();
    }

    // 5b. Test CSV import with AUTO + blank barcode -> 1-click fill -> import -> print imported labels
    await page.waitForSelector("[data-action='import-products']:visible");
    await page.locator("[data-action='import-products']:visible").first().click();
    await page.waitForSelector('#product-import-file');
    const csvHeaders = ['Mã SKU', 'Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Đơn vị', 'Giá bán (VND)', 'Giá vốn (VND)', 'Ngưỡng tồn tối thiểu', 'Theo dõi tồn kho (Có/Không)', 'Tồn đầu kỳ', 'Tên nhóm biến thể', 'Thuộc tính biến thể (Tên=Giá trị; ...)'];
    const csvRows = [
      ['E2E-AUTO-1', 'AUTO', 'Bánh quy bơ E2E', 'Bánh kẹo', 'hộp', '42000', '25000', '2', 'Có', '4', '', ''],
      ['E2E-BLANK-2', '', 'Nước suối lạnh E2E', 'Đồ uống', 'chai', '10000', '4000', '5', 'Có', '6', '', ''],
    ];
    const csvContent = '\uFEFF' + [csvHeaders, ...csvRows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n') + '\r\n';
    await page.setInputFiles('#product-import-file', { name: 'e2e-barcode-import.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent, 'utf8') });
    await page.waitForSelector(".modal [data-action='import-fill-barcodes']");
    const [repreviewRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/products/import/preview') && res.request().method() === 'POST'),
      page.locator(".modal [data-action='import-fill-barcodes']").click(),
    ]);
    assert.equal(repreviewRes.status(), 200, `${label}: import-fill-barcodes preview must succeed`);
    await page.waitForSelector(".modal button[type='submit'][form='entity-form']:not([disabled])");
    const [importSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/products/import') && !res.url().includes('/preview') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(importSaveRes.status(), 201, `${label}: CSV import save must return 201`);
    await page.waitForSelector(".modal [data-action='print-barcode-imported']");
    await page.locator(".modal [data-action='print-barcode-imported']").click();
    await page.waitForSelector(".modal:not([hidden]) [data-form='barcode-print'] [data-barcode-sheet-preview] svg.barcode-svg");
    await page.selectOption('#barcode-paper-size', 'thermal-1up');
    await page.fill("[data-barcode-filter]", 'Nước suối');
    await page.waitForTimeout(100);
    await assertNoHorizontalOverflow(page, `${label}:barcode-print-modal`);
    await page.locator(".modal [data-action='close-modal']").first().click();
    await page.waitForSelector('#modal[hidden]', { state: 'attached' });

    // 6. Switch to Kho hàng: test restructured sub-tabs including Trả NCC
    await page.locator("#primary-nav [data-route='inventory']:visible, #mobile-nav [data-route='inventory']:visible").first().click();
    await page.waitForSelector("[data-action='inventory-tab']");
    for (const tab of ['purchases', 'supplier-returns', 'stock-count', 'stock']) {
      const tabBtn = page.locator(`[data-action='inventory-tab'][data-tab='${tab}']`);
      if (await tabBtn.count()) {
        await tabBtn.click();
        await page.waitForTimeout(250);
        await assertNoHorizontalOverflow(page, `${label}:inventory-${tab}`);
      }
    }
    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await page.locator('.toast').first().waitFor({ state: 'hidden' });
      await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-inventory.png`) });
    }

    // 7. Test Order Detail & Đổi hàng (SlinkReturnsExchangeUI)
    await page.locator("#primary-nav [data-route='orders']:visible, #mobile-nav [data-route='orders']:visible").first().click();
    await page.waitForSelector("[data-action='order-detail']", { timeout: 15000 });
    await page.locator("[data-action='order-detail']").first().click();
    await page.waitForSelector('.modal:not([hidden])');
    const exchangeBtn = page.locator(".modal [data-action='exchange-order']");
    if (!(await exchangeBtn.isVisible())) {
      await page.locator('.modal .order-more-actions summary').click();
    }
    await exchangeBtn.click();
    await page.waitForSelector(".modal [data-form='order-exchange'] .exchange-summary");
    const [exchangeRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/exchange') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(exchangeRes.status(), 201, `${label}: order exchange POST must succeed with 201`);
    await page.waitForTimeout(350);
    await page.locator(".modal [data-action='close-modal']").first().click().catch(() => {});

    // 8. Finance separates the actual cashbook, manual vouchers, shifts and debt work.
    await page.locator("#primary-nav [data-route='workspace']:visible, #mobile-nav [data-route='workspace']:visible").first().click();
    await page.locator("#view [data-route='finance']").click();
    await page.waitForSelector("[data-action='finance-tab']");
    assert.equal(await page.locator("[data-action='finance-tab']").count(), 5, `${label}: owner finance must expose five distinct work areas`);
    for (const [tab, content] of [
      ['cashbook', 'Sổ thu chi'],
      ['vouchers', 'Phiếu thu và phiếu chi'],
      ['shifts', 'Tiền mặt trong quầy'],
      ['receivables', 'Tổng cần thu'],
      ['payables', 'Tổng cần trả'],
    ]) {
      await page.locator(`[data-action='finance-tab'][data-tab='${tab}']`).click();
      await page.locator('[data-finance-content]').getByText(content, { exact: false }).first().waitFor();
      await assertNoHorizontalOverflow(page, `${label}:finance-${tab}`);
      if (process.env.SLINK_E2E_SCREENSHOT_DIR && ['cashbook', 'receivables'].includes(tab)) {
        await page.locator('.toast').first().waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-finance-${tab}.png`) });
      }
    }
    await page.locator("[data-action='finance-tab'][data-tab='receivables']").click();
    await page.locator('#finance-receivable-search').fill('Khách Giao Hàng');
    await page.locator('[data-finance-content] .activity-list [data-action="finance-receivable"]').first().waitFor();
    await page.getByText('Hiển thị 1 trên 1 khách còn nợ').waitFor();
    const searchedCustomerId = await page.locator('[data-finance-content] .activity-list [data-action="finance-receivable"]').first().getAttribute('data-id');
    const inSummary = await page.evaluate(async ({ storeId, customerId }) => {
      const response = await fetch(`/api/stores/${storeId}/finance`, { credentials: 'same-origin' });
      const data = await response.json();
      return data.customerDebtors.some((customer) => customer.id === customerId);
    }, { storeId: seeded.storeId, customerId: searchedCustomerId });
    assert.equal(inSummary, false, `${label}: searched debtor must be outside finance summary's top ten`);
    await skipTour();
    await page.locator('[data-finance-content] .activity-list [data-action="finance-receivable"]').first().click();
    await page.locator('.finance-debt-detail').waitFor();
    await page.locator(".finance-debt-detail [data-action='finance-reminder']").click();
    await page.locator('.modal [data-finance-reminder]').waitFor();
    assert.match(await page.locator('.modal [data-finance-reminder]').inputValue(), /Khách Giao Hàng E2E/);
    await page.locator(".modal [data-action='close-modal']").first().click();
    await assertNoHorizontalOverflow(page, `${label}:finance-receivable-detail`);
    assert.equal(await page.locator("[data-action='new-expense'][data-direction='in']:visible").count() > 0, true, `${label}: record income remains reachable`);

    const assetsOk = await page.evaluate(async () => {
      const a = await fetch('/offline-conflict-ui.js', { credentials: 'same-origin' });
      const b = await fetch('/supplier-returns-ui.js', { credentials: 'same-origin' });
      const c = await fetch('/barcode-tools.js', { credentials: 'same-origin' });
      return a.ok && b.ok && c.ok && Boolean(window.SlinkBarcodeTools) && Boolean(window.SlinkOfflineConflictUI) && Boolean(window.SlinkReturnsExchangeUI);
    });
    assert.equal(assetsOk, true, 'All standalone commercial UI bundles must be loaded');
    assert.ok(seeded.storeId);

    assert.deepEqual(pageErrors, [], `${label} pageErrors: ${pageErrors.join('; ')}`);
    assert.deepEqual(serverErrors, [], `${label} 5xx: ${serverErrors.join('; ')}`);
    assert.deepEqual(consoleErrors, [], `${label} consoleErrors: ${consoleErrors.join('; ')}`);
  } finally {
    await context.close();
  }
}

async function launchBrowser(chromium) {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const executablePath of candidates) {
    try {
      await fs.access(executablePath);
      return await chromium.launch({ headless: true, executablePath });
    } catch {}
  }
  return chromium.launch({ headless: true });
}

async function run() {
  const { chromium } = loadPlaywright();
  const runtimeApp = await bootTempApp();
  const browser = await launchBrowser(chromium);
  try {
    await runViewportAudit(browser, runtimeApp.origin, { width: 390, height: 844 }, 'mobile-390');
    await runViewportAudit(browser, runtimeApp.origin, { width: 1440, height: 900 }, 'desktop-1440');
    console.log('PASS: Playwright E2E verified on 390x844 mobile and 1440x900 desktop (0 overflow, 0 console/page/5xx errors).');
  } finally {
    await browser.close();
    await runtimeApp.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
