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
  const dims = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const offenders = scrollWidth > innerWidth + 1
      ? Array.from(document.querySelectorAll('*'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 1
            ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''}(right=${Math.round(r.right)},sw=${el.scrollWidth},cw=${el.clientWidth})`
            : null;
        })
        .filter(Boolean)
        .slice(0, 8)
      : [];
    return { scrollWidth, innerWidth, offenders };
  });
  assert.ok(
    dims.scrollWidth <= dims.innerWidth + 1,
    `${label}: horizontal overflow ${dims.scrollWidth} > ${dims.innerWidth} [${dims.offenders.join(', ')}]`
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
    const pSingle = await createProd('ONE-01', '8938505999911', 'Bình giữ nhiệt độc bản', 99000, 40000);

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
          { productId: pSingle.id, quantity: 1, unitCostVnd: 40000 },
        ],
        amountPaidVnd: 430000,
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
    await page.locator("[data-action='guided-tour-skip']:visible").first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
    await skipTour();

    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.SLINK_E2E_SCREENSHOT_DIR, { recursive: true });
    }
    for (const route of ['dashboard', 'products', 'inventory', 'orders', 'workspace']) {
      await skipTour();
      const btn = page.locator(`[data-route='${route}']:visible`).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(250);
        await skipTour();
        await assertNoHorizontalOverflow(page, `${label}:${route}`);
        if (process.env.SLINK_E2E_SCREENSHOT_DIR && ['dashboard', 'workspace'].includes(route)) {
          await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-${route}.png`) });
        }
      }
    }

    // 1. Verify separated topbar Bán hàng CTA for Owner
    const topbarPos = page.locator('#topbar-pos-cta:visible');
    assert.equal(await topbarPos.count(), 1, `${label}: #topbar-pos-cta must be visible for owner`);
    await topbarPos.click();
    await page.waitForSelector('.pos-product-grid button');
    await assertNoHorizontalOverflow(page, `${label}:pos-topbar`);
    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-pos.png`) });
    }

    // 2. Hardware barcode Enter auto-add + verify already-sold 1-unit barcode CANNOT be resold
    await page.fill('#pos-search', '8938505999911');
    await page.press('#pos-search', 'Enter');
    await page.waitForTimeout(250);

    // 3. Unified Sapo POS (1-tap sale with denomination chips without modal)
    await assertNoHorizontalOverflow(page, `${label}:pos-unified`);
    if (await page.locator(".pos-layout > .cart-panel [data-action='standard-pay']").isVisible()) {
      await page.locator(".pos-layout > .cart-panel [data-action='fast-cash-preset']").first().click();
      await page.locator(".pos-layout > .cart-panel [data-action='standard-pay']").click();
    } else {
      await page.locator(".pos-mobile-checkout[data-action='standard-pay']").click();
    }
    await page.waitForSelector('.sale-saved');

    // Rescanning the already-sold 1-unit barcode MUST be blocked immediately (cart count stays 0)
    await page.fill('#pos-search', '8938505999911');
    await page.press('#pos-search', 'Enter');
    await page.waitForTimeout(300);
    const soldOutCount = await page.locator('.pos-mobile-cart .mobile-cart-count').textContent();
    assert.equal(soldOutCount.trim(), '0', `${label}: already-sold barcode must not re-enter cart`);

    // 3b. Test multi-bill tabs in unified Tại quầy POS (Đơn 1 -> add item -> open Đơn 2 -> empty -> switch back -> 1-click pay)
    await page.fill('#pos-search', '8938505974194');
    await page.press('#pos-search', 'Enter');
    await page.waitForTimeout(250);
    if (await page.locator(".pos-layout > .cart-panel [data-action='pos-bill-add']").isVisible()) {
      await page.locator(".pos-layout > .cart-panel [data-action='pos-bill-add']").click();
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".pos-layout > .cart-panel .cart-row").count(), 0, `${label}: new Đơn 2 must start empty`);
      await page.locator(".pos-layout > .cart-panel [data-action='pos-bill-switch']").first().click();
      await page.waitForTimeout(100);
      assert.equal(await page.locator(".pos-layout > .cart-panel .cart-row").count(), 1, `${label}: switching back to Đơn 1 must restore cart`);
      const [stdSaleRes] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/sales') && res.request().method() === 'POST'),
        page.locator(".pos-layout > .cart-panel [data-action='standard-pay']").click(),
      ]);
      assert.equal(stdSaleRes.status(), 201, `${label}: standard-pay POST /sales must succeed with 201`);
    } else {
      const [stdSaleRes] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/sales') && res.request().method() === 'POST'),
        page.locator(".pos-mobile-checkout[data-action='standard-pay']").click(),
      ]);
      assert.equal(stdSaleRes.status(), 201, `${label}: mobile standard-pay POST /sales must succeed with 201`);
    }

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
      assert.equal(await page.locator('.modal [data-action="product-card-choice"]').count(), 5, `${label}: one card menu exposes five non-overlapping actions including clone`);
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

    // 5c. KiotViet/Sapo Individual Serial Tracking + Non-Numeric Barcode + Add Units + Block Reselling Sold Code
    const serialCode1 = `SACH-${label.toUpperCase()}-01`;
    const serialCode2 = `QR/${label.toUpperCase()}-02`;
    const serialCode3 = `BOOK-${label.toUpperCase()}-03`;
    await page.locator("[data-action='new-product']:visible").first().click();
    await page.waitForSelector(".modal:not([hidden]) [data-action='switch-product-stock-mode'][data-mode='serial']");
    await page.fill(".modal [name='name']", `Sách Tiếng Anh ${label}`);
    await page.fill(".modal [name='price']", '120000');
    await page.locator(".modal [data-action='switch-product-stock-mode'][data-mode='serial']").click();
    await page.fill(".modal #serial-rapid-input", serialCode1);
    await page.locator(".modal [data-action='add-serial-from-input']").click();
    await page.fill(".modal #serial-rapid-input", serialCode2);
    await page.locator(".modal [data-action='add-serial-from-input']").click();
    assert.equal(await page.locator(".modal [data-serial-count]").textContent(), '2', `${label}: serial count must equal 2`);
    const [serialCreateRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/products/import') && !res.url().includes('/preview') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']:not([data-add-another]):not([data-print-after])").click(),
    ]);
    assert.equal(serialCreateRes.status(), 201, `${label}: serial product creation must return 201`);
    await page.waitForSelector('#modal[hidden]', { state: 'attached' });

    // Add 1 more unit to the existing product via "＋ Thêm tồn / Quét mã" without re-entering product info
    if (viewport.width <= 640) {
      const serialCard = page.locator('.product-mobile-card').filter({ hasText: `Sách Tiếng Anh ${label}` });
      await serialCard.locator('[data-action="product-card-menu"]').click();
      await page.locator('.modal [data-action="product-card-choice"][data-kind="add-units"]').click();
    } else {
      const serialRow = page.locator('table.data-table tbody tr').filter({ hasText: `Sách Tiếng Anh ${label}` });
      await serialRow.locator('[data-action="add-product-units"]').click();
    }
    await page.waitForSelector(".modal:not([hidden]) [data-form='add-product-units'] #serial-rapid-input");
    await page.fill(".modal #serial-rapid-input", serialCode3);
    await page.locator(".modal [data-action='add-serial-from-input']").click();
    const [addSerialRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/serials') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']:not([data-print-after])").click(),
    ]);
    assert.equal(addSerialRes.status(), 201, `${label}: adding serial unit to existing product must return 201`);
    await page.waitForSelector('#modal[hidden]', { state: 'attached' });

    // Go to POS: sell serialCode1, verify rescanning serialCode1 is BLOCKED, verify serialCode2 SUCCEEDS
    await page.locator("#topbar-pos-cta:visible, [data-route='pos']:visible").first().click();
    await page.waitForSelector('#pos-search');
    await page.locator("[data-action='pos-mode'][data-mode='standard']").click();
    await page.fill('#pos-search', serialCode1);
    const [lookupRes1] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/serials/lookup') && res.request().method() === 'GET'),
      page.locator('#pos-search').press('Enter'),
    ]);
    assert.equal(lookupRes1.status(), 200, `${label}: serial lookup must succeed`);
    await page.waitForTimeout(150);
    const payBtnSelector = viewport.width <= 640
      ? ".pos-mobile-checkout[data-action='standard-pay']"
      : ".pos-layout > .cart-panel [data-action='standard-pay']";
    if (viewport.width > 640) {
      assert.equal(await page.locator(".pos-layout > .cart-panel .cart-serial-chips .serial-chip").count(), 1, `${label}: cart must display scanned serial chip`);
    }
    const [serialSaleRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/sales') && res.request().method() === 'POST'),
      page.locator(payBtnSelector).click(),
    ]);
    assert.equal(serialSaleRes.status(), 201, `${label}: selling serialCode1 must return 201`);
    await page.waitForSelector('.sale-saved');
    if (await page.locator('.modal:not([hidden]) [data-action="close-modal"]').count()) {
      await page.locator('.modal:not([hidden]) [data-action="close-modal"]').first().click();
      await page.waitForSelector('#modal[hidden]', { state: 'attached' });
    }
    await page.waitForTimeout(150);

    // Rescan ALREADY-SOLD serialCode1 -> MUST be blocked (cart stays 0!)
    await page.fill('#pos-search', serialCode1);
    const [lookupSoldRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/serials/lookup') && res.request().method() === 'GET'),
      page.locator('#pos-search').press('Enter'),
    ]);
    assert.equal(lookupSoldRes.status(), 200);
    await page.waitForTimeout(150);
    if (viewport.width > 640) {
      assert.equal(await page.locator(".pos-layout > .cart-panel .cart-row").count(), 0, `${label}: rescanning sold serial must NOT add to cart`);
    }

    // Scan unsold non-numeric QR serialCode2 -> MUST succeed!
    await page.fill('#pos-search', serialCode2);
    const [lookupRes2] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/serials/lookup') && res.request().method() === 'GET'),
      page.locator('#pos-search').press('Enter'),
    ]);
    assert.equal(lookupRes2.status(), 200);
    await page.waitForTimeout(150);
    if (viewport.width > 640) {
      assert.equal(await page.locator(".pos-layout > .cart-panel .cart-serial-chips .serial-chip").count(), 1, `${label}: unsold QR serial must add to cart`);
      await page.locator(".pos-layout > .cart-panel [data-action='cart-remove-serial']").first().click();
      await page.waitForTimeout(100);
    } else {
      await page.locator("[data-action='open-cart']:visible").first().click();
      await page.waitForSelector("#drawer-cart.open .cart-serial-chips .serial-chip");
      await page.locator("#drawer-cart [data-action='cart-remove-serial']").first().click();
      await page.waitForTimeout(100);
      await page.locator("#drawer-cart [data-action='close-cart']").click().catch(() => {});
    }

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

    // 6.5. Creating a second warehouse in Kho hàng must not trap POS into an empty catalog
    await page.locator("[data-action='inventory-tab'][data-tab='stock']").click().catch(() => {});
    const newWhBtn = page.locator("[data-action='new-warehouse']").first();
    if (await newWhBtn.isVisible()) {
      await newWhBtn.click();
      await page.waitForSelector(".modal:not([hidden]) [data-form='warehouse-create']");
      const closeBox = await page.locator(".modal:not([hidden]) .modal-close").boundingBox();
      if (viewport.width <= 700 && closeBox) {
        assert.ok(closeBox.width >= 44 && closeBox.height >= 44, `${label}: modal close button ${closeBox.width}x${closeBox.height} must be >= 44px`);
      }
      await page.fill(".modal [name='code']", `K2-${label === 'mobile-390' ? 'M' : 'D'}`);
      await page.fill(".modal [name='name']", `Kho phụ ${label}`);
      const [whRes] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/warehouses') && res.request().method() === 'POST'),
        page.locator(".modal button[type='submit'][form='entity-form']").click(),
      ]);
      assert.equal(whRes.status(), 201, `${label}: creating second warehouse must return 201`);
      await page.waitForTimeout(300);
      await page.locator("#primary-nav [data-route='pos']:visible, #mobile-nav [data-route='pos']:visible").first().click();
      await page.waitForSelector('.pos-product-grid', { timeout: 15000 });
      assert.ok((await page.locator('.pos-product').count()) >= 1, `${label}: POS products must remain visible after creating secondary warehouse`);
    }

    // 7. Test Order Detail & Đổi hàng (SlinkReturnsExchangeUI)
    await page.locator("#primary-nav [data-route='orders']:visible, #mobile-nav [data-route='orders']:visible").first().click();
    await page.waitForSelector("[data-action='order-detail']", { timeout: 15000 });
    await assertNoHorizontalOverflow(page, `${label}:orders-segmented`);
    await page.locator("[data-action='order-detail']").nth(2).click();
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
    assert.equal(exchangeRes.status(), 201, `${label}: order exchange POST must succeed with 201 (${await exchangeRes.text()})`);
    await page.waitForTimeout(350);
    await page.locator(".modal [data-action='close-modal']").first().click().catch(() => {});

    // 8. Finance separates the actual cashbook, manual vouchers, shifts and debt work.
    await page.locator("#primary-nav [data-route='workspace']:visible, #mobile-nav [data-route='workspace']:visible").first().click();
    await page.locator("#view [data-route='finance']").click();
    await page.waitForSelector("[data-action='finance-tab']");
    assert.equal(await page.locator("[data-action='finance-tab']").count(), 5, `${label}: owner finance must expose five distinct work areas`);
    for (const [tab, content] of [
      ['cashbook', 'Sổ quỹ thu chi'],
      ['vouchers', 'Phiếu thu / chi & Chuyển quỹ'],
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
    // 8b. Verify Cashbook fund switcher, internal cash transfer, P&L expense + 'other' counterparty, void reversal & Reports net profit
    await page.locator("[data-action='finance-tab'][data-tab='cashbook']").click();
    await page.waitForSelector("[data-action='cashbook-fund'][data-fund='bank']");
    await page.locator("[data-action='cashbook-fund'][data-fund='bank']").click();
    await page.waitForTimeout(200);
    await assertNoHorizontalOverflow(page, `${label}:finance-cashbook-bank`);
    await page.locator("[data-action='cashbook-fund'][data-fund='all']").click();
    await page.waitForTimeout(200);

    // Record an operating expense with counterparty 'other' & includeInPnl=true
    await page.locator("[data-action='new-expense'][data-direction='out']:visible").first().click();
    await page.waitForSelector(".modal [data-form='cash']");
    await page.fill(".modal [data-form='cash'] [name='amount']", '150000');
    await page.selectOption(".modal [data-form='cash'] [name='partyKind']", 'other');
    await page.fill("#voucher-party-other-name", 'Điện lực EVN');
    await page.fill(".modal [data-form='cash'] [name='note']", `Tiền điện E2E ${label}`);
    const [expSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/cash-movements') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(expSaveRes.status(), 201, `${label}: manual expense with other counterparty must return 201`);
    await page.waitForTimeout(300);

    // Internal cash transfer cash -> bank (drawer has seeded 150k/pos cash; transfer 20k)
    await page.locator("[data-finance-content] [data-action='open-cash-transfer']").first().click();
    await page.waitForSelector(".modal [data-form='cash-transfer']");
    await page.fill(".modal [data-form='cash-transfer'] [name='amount']", '20000');
    await page.fill(".modal [data-form='cash-transfer'] [name='note']", 'Nộp quỹ ngân hàng E2E');
    const [xferRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/cash-transfers') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(xferRes.status(), 201, `${label}: cash transfer POST must return 201`);
    await page.waitForTimeout(300);

    // Check Reports displays Net Profit and Operating Expense 150.000
    await page.locator("#primary-nav [data-route='workspace']:visible, #mobile-nav [data-route='workspace']:visible").first().click();
    const reportsBtn = page.locator("#view [data-route='reports']");
    if (!(await reportsBtn.isVisible())) {
      await page.locator("#view details.directory-fold:has([data-route='reports']) > summary").click();
    }
    await reportsBtn.click();
    await page.waitForSelector('.fv-pnl-grid', { timeout: 15000 });
    await page.locator('.fv-pnl-grid').getByText('150.000 ₫').first().waitFor();
    await assertNoHorizontalOverflow(page, `${label}:reports-pnl`);

    // Go back to Finance -> Cashbook and void the 150,000 expense cleanly
    await page.locator("#primary-nav [data-route='workspace']:visible, #mobile-nav [data-route='workspace']:visible").first().click();
    const financeBtn = page.locator("#view [data-route='finance']");
    if (!(await financeBtn.isVisible())) {
      await page.locator("#view details.directory-fold:has([data-route='finance']) > summary").click();
    }
    await financeBtn.click();
    await page.waitForSelector("[data-action='finance-tab'][data-tab='cashbook']");
    await page.locator('#finance-cashbook-search').fill(`Tiền điện E2E ${label}`);
    await page.waitForTimeout(450);
    await page.locator("[data-finance-content] [data-action='void-cash-movement']:visible").first().click();
    await page.waitForSelector(".modal [data-form='void-cash-movement']");
    await page.fill(".modal [data-form='void-cash-movement'] [name='reason']", 'Hủy kiểm thử E2E');
    const [voidRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/void') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(voidRes.status(), 201, `${label}: void cash movement POST must return 201`);
    await page.waitForTimeout(300);
    await page.locator('#finance-cashbook-search').fill('');
    await page.waitForTimeout(350);

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

    // 9. Test Cài đặt Cửa hàng → Tài khoản nhận chuyển khoản (VietQR) — clean UI without awkward extra tab or raw .env jargon
    const settingsBtn = page.locator("[data-action='account-settings']:visible, #primary-nav [data-route='settings']:visible").first();
    await settingsBtn.click();
    await page.waitForSelector('.settings-areas', { timeout: 15000 });
    const storeSettingsTab = page.locator("[data-action='settings-area']", { hasText: 'Thanh toán & Tích hợp' }).first();
    await storeSettingsTab.click();
    await page.waitForSelector('#integration-settings-form', { timeout: 15000 });
    const settingsText = await page.locator('#integrations-panel').textContent();
    assert.equal(/MOMO_PARTNER_CODE|SEPAY_WEBHOOK_TOKEN|VIETTEL_EINVOICE/.test(settingsText || ''), false, `${label}: Settings must not show raw .env variable names`);
    await page.selectOption('#int-bank-bin', '970436');
    await page.fill('#int-bank-account', '1903668899');
    await page.fill('#int-bank-owner', 'SLINK TEST');
    await page.waitForSelector('#int-vietqr-preview .vietqr-svg', { timeout: 5000 });
    const [intSaveRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/integrations/settings') && res.request().method() === 'PUT'),
      page.locator("#integration-settings-form button[type='submit']").click(),
    ]);
    assert.equal(intSaveRes.status(), 200, `${label}: saving VietQR integration config must succeed`);

    // Verify toast does not block viewport and click-to-dismiss works immediately
    await page.waitForSelector('.toast', { timeout: 5000 });
    const toastMetrics = await page.evaluate(() => {
      const el = document.querySelector('.toast');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    assert.ok(toastMetrics && toastMetrics.height < 140 && toastMetrics.width <= 380, `${label}: toast must remain compact, got ${JSON.stringify(toastMetrics)}`);
    await page.locator('.toast .toast-close').click();
    assert.equal(await page.locator('.toast').count(), 0, `${label}: clicking toast close must dismiss immediately`);

    // Verify Settings has 4 focused tabs + Advanced Integrations fold + POS Voice pref + Help 3.0 modal
    const settingsTabs = page.locator("[data-action='settings-area']");
    assert.equal(await settingsTabs.count(), 4, `${label}: Settings must have 4 clean tabs`);
    assert.equal(await page.locator('.settings-advanced-fold').count(), 1, `${label}: Advanced integrations fold must remain reachable`);
    await assertNoHorizontalOverflow(page, `${label}:settings-integrations`);
    await page.locator("[data-action='settings-area']", { hasText: 'Bán hàng & Thiết bị' }).first().click();
    await page.waitForSelector("form[data-form='pos-prefs'] input[name='voiceAnnounce']", { timeout: 5000 });
    assert.equal(await page.locator("form[data-form='pos-prefs'] input[name='voiceAnnounce']").isChecked(), true, `${label}: voiceAnnounce defaults to enabled`);
    await assertNoHorizontalOverflow(page, `${label}:settings-pos-device`);
    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-settings.png`) });
    }

    await page.locator('.topbar .help-button:visible').first().click();
    await page.waitForSelector('.help-shortcut-grid', { timeout: 5000 });
    assert.match(await page.locator('#modal-title').textContent() || '', /Trung tâm Trợ giúp Slink 3\.0/);
    assert.equal(await page.locator('.help-shortcut-item').count(), 6, `${label}: Help modal must display 6 POS shortcuts`);
    await assertNoHorizontalOverflow(page, `${label}:help-modal`);
    await page.locator(".modal [data-action='close-modal']").first().click();
    await page.locator('#modal').waitFor({ state: 'hidden' });

    // 10. Test Staff direct-create, dynamic role permissions, VN banks dropdown, Payroll (staffPayroll) & Radar subtabs
    await page.locator("#primary-nav [data-route='workspace']:visible, #mobile-nav [data-route='workspace']:visible").first().click();
    const staffNavBtn = page.locator("#view [data-route='staff']");
    if (!(await staffNavBtn.isVisible())) {
      await page.locator("#view details.directory-fold:has([data-route='staff']) > summary").click();
    }
    await staffNavBtn.click();
    await page.waitForSelector("[data-action='new-staff-direct']", { timeout: 15000 });

    await page.locator("[data-action='new-staff-direct']").click();
    await page.waitForSelector("form[data-form='staff-direct-create']", { timeout: 5000 });
    await page.selectOption("form[data-form='staff-direct-create'] select[name='role']", 'manager');
    assert.equal(
      await page.locator("form[data-form='staff-direct-create'] [data-direct-perm='view_reports']").isChecked(),
      true,
      `${label}: changing role in staff-direct-create must sync granular permissions`
    );
    await page.fill("form[data-form='staff-direct-create'] input[name='displayName']", 'Nhân viên E2E');
    await page.fill("form[data-form='staff-direct-create'] input[name='email']", `staff-${label}-${Date.now()}@slink.test`);
    await page.fill("form[data-form='staff-direct-create'] input[name='password']", 'SlinkStaffPass123!');
    const [directCreateRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/staff/direct-create') && res.request().method() === 'POST'),
      page.locator(".modal button[type='submit'][form='entity-form']").click(),
    ]);
    assert.equal(directCreateRes.status(), 201, `${label}: direct staff creation must succeed with 201`);
    await page.locator('#modal').waitFor({ state: 'hidden' });
    await page.locator('.staff-row', { hasText: 'Nhân viên E2E' }).first().waitFor({ timeout: 10000 });
    if (await page.locator('.toast .toast-close').count()) {
      await page.locator('.toast .toast-close').first().click();
    }
    await assertNoHorizontalOverflow(page, `${label}:staff-members`);
    if (process.env.SLINK_E2E_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.SLINK_E2E_SCREENSHOT_DIR, `${label}-staff.png`) });
    }

    // Verify VN banks list (> 20 options) & bank account attribute alignment
    await page.locator('.staff-row .staff-details > summary').first().click();
    const bankOptionsCount = await page.locator('[data-member-bank-bin] option').first().evaluate((opt) => opt.parentElement.options.length);
    assert.ok(bankOptionsCount > 20, `${label}: VN_BANKS dropdown must populate bank options, got ${bankOptionsCount}`);
    assert.ok(await page.locator('[data-member-bank-acc]').count() > 0, `${label}: staff bank account input must use data-member-bank-acc`);

    // Verify Payroll subtab loads staffPayroll rows & Radar subtab opens cleanly
    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/payroll') && res.request().method() === 'GET'),
      page.locator("[data-action='staff-subtab'][data-subtab='payroll']").click(),
    ]);
    await page.locator('tr[data-payroll-row]', { hasText: 'Nhân viên E2E' }).first().waitFor({ timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${label}:staff-payroll`);

    await Promise.all([
      page.waitForResponse((res) => res.url().includes('/loss-prevention-radar') && res.request().method() === 'GET'),
      page.locator("[data-action='staff-subtab'][data-subtab='radar']").click(),
    ]);
    await page.getByText('Radar Chống Thất Thoát Thực Chiến').first().waitFor({ timeout: 10000 });
    await assertNoHorizontalOverflow(page, `${label}:staff-radar`);

    const assetsOk = await page.evaluate(async () => {
      const urls = ['/offline-conflict-ui.js', '/supplier-returns-ui.js', '/barcode-tools.js', '/banks-vn.js', '/vietqr-tools.js', '/escpos-printer.js', '/integrations-ui.js', '/finance-vouchers-ui.js', '/sync-bus.js', '/pos-hardware.js', '/receipt-image.js'];
      const responses = await Promise.all(urls.map((u) => fetch(u, { credentials: 'same-origin' })));
      return responses.every((r) => r.ok) && Boolean(window.SlinkBarcodeTools) && Boolean(window.SlinkOfflineConflictUI) && Boolean(window.SlinkReturnsExchangeUI) && Boolean(window.SlinkIntegrationsUI) && Boolean(window.SlinkVietQrTools) && Boolean(window.SlinkFinanceUI) && Boolean(window.SlinkSyncBus) && Boolean(window.SlinkPosHardware) && Boolean(window.SlinkReceiptImage);
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
