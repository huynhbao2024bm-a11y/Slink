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
    NODE_ENV: 'development',
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

    const createProd = async (sku, name, salePriceVnd, costVnd) => {
      const r = await fetch(`/api/stores/${storeId}/products`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ sku, name, category: 'Đồ uống', unit: 'ly', salePriceVnd, costVnd, lowStockThreshold: 2, inventoryTracked: true }),
      });
      if (!r.ok) throw new Error(`Product create failed: ${r.status}`);
      return (await r.json()).product;
    };
    const p1 = await createProd('CF-01', 'Cà phê đá E2E', 35000, 12000);
    const p2 = await createProd('TR-01', 'Trà đào cam sả', 45000, 15000);

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

    for (const route of ['dashboard', 'pos', 'orders', 'inventory', 'finance']) {
      const btn = page.locator(`[data-route='${route}']:visible`).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(300);
        await assertNoHorizontalOverflow(page, `${label}:${route}`);
      }
    }

    await page.locator(`[data-route='pos']:visible`).first().click();
    await page.waitForSelector('.pos-product-grid button');
    await page.locator('.pos-product-grid button').first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-action='checkout']:visible").first().click();
    await page.waitForSelector('.modal:not([hidden])');
    await page.locator(".modal button[type='submit'], .modal [data-action='confirm-checkout'], .modal .btn-primary").first().click();
    await page.waitForTimeout(450);
    await assertNoHorizontalOverflow(page, `${label}:pos-after-sale`);

    const assetsOk = await page.evaluate(async () => {
      const a = await fetch('/offline-conflict-ui.js', { credentials: 'same-origin' });
      const b = await fetch('/supplier-returns-ui.js', { credentials: 'same-origin' });
      return a.ok && b.ok;
    });
    assert.equal(assetsOk, true, 'Standalone helper UI bundles must be served HTTP 200');
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
