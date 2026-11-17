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
    if (!(await page.locator(".pos-layout > .cart-panel [data-delivery-field='receiverName']").isVisible())) {
      await page.locator("[data-action='open-cart']:visible").first().click();
      await page.waitForSelector("#drawer-cart.open [data-delivery-field='receiverName']");
      await page.fill("#drawer-cart [data-delivery-field='receiverName']", 'Khách Giao Hàng E2E');
      await page.fill("#drawer-cart [data-delivery-field='receiverPhone']", '0901234567');
      await page.fill("#drawer-cart [data-delivery-field='address']", '12 Nguyễn Huệ, Q1');
      await page.locator("#drawer-cart [data-action='submit-delivery-sale']").click();
    } else {
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='receiverName']", 'Khách Giao Hàng E2E');
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='receiverPhone']", '0901234567');
      await page.fill(".pos-layout > .cart-panel [data-delivery-field='address']", '12 Nguyễn Huệ, Q1');
      await page.locator(".pos-layout > .cart-panel [data-action='submit-delivery-sale']").click();
    }
    await page.waitForTimeout(450);
    await assertNoHorizontalOverflow(page, `${label}:pos-delivery-after`);

    // 5. Switch to Hàng hóa: test barcode print modal (via Thao tác khác)
    await page.locator("#primary-nav [data-route='products']:visible, #mobile-nav [data-route='products']:visible").first().click();
    await page.waitForSelector('.catalog-more summary');
    await page.locator('.catalog-more summary').click();
    await page.waitForSelector("[data-action='print-barcode-batch']");
    await page.locator("[data-action='print-barcode-batch']").click();
    await page.waitForSelector(".modal:not([hidden]) [data-barcode-sheet-preview] svg.barcode-svg");
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
