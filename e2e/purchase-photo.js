'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { bootTempApp, launchBrowser, loadPlaywright, registerOwnerInBrowser } = require('./commercial-responsive');

async function seedStore(page) {
  return page.evaluate(async () => {
    const S = window.Slink;
    const base = '/api/stores/' + S.state.store.id;
    const warehouses = await S.fn.apiRequest(base + '/warehouses');
    const warehouseId = warehouses.warehouses[0].id;
    const { product } = await S.fn.apiRequest(base + '/products', {
      method: 'POST',
      body: { sku: 'PAPER-01', name: 'Giấy A4', unit: 'tờ', salePriceVnd: 3000, costVnd: 0, inventoryTracked: true,
        purchasePack: { name: 'ram', size: '100', quantity: '1', unitCostVnd: '200000' } },
    });
    await S.fn.apiRequest(base + '/purchases', {
      method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() },
      body: { warehouseId, supplierName: 'Văn phòng phẩm An', amountPaidVnd: 0,
        items: [{ productId: product.id, quantity: '1', unitCostVnd: '1000' }] },
    });
    const other = await S.fn.apiRequest(base + '/warehouses', {
      method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: { code: 'K2', name: 'Kho phụ' },
    });
    await S.fn.loadWarehouses({ includeTransfers: false });
    return { base, warehouseId, otherWarehouseId: other.warehouse.id, paper: product.id };
  });
}

async function exerciseReceipt(page, setFixture) {
  const seed = await seedStore(page);
  const selector = '[data-form=receive]';
  const form = page.locator(selector);
  const image = await sharp({ create: { width: 500, height: 700, channels: 3, background: 'white' } }).jpeg().toBuffer();
  async function startReceipt(fixture) {
    setFixture(fixture);
    await form.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.Slink.fn.openReceive());
    await form.waitFor();
    await form.locator('input[type=file]').setInputFiles({ name: 'phieu.jpg', mimeType: 'image/jpeg', buffer: image });
  }
  const confirm = page.getByRole('button', { name: 'Xác nhận nhập kho' });
  const summary = form.locator('[data-photo-summary]');
  async function save(doubleClick = false) {
    const [response] = await Promise.all([
      page.waitForResponse(r => /\/(purchases|purchase-packs)$/.test(r.url()) && r.request().method() === 'POST'),
      doubleClick ? confirm.evaluate(button => { button.click(); button.click(); }) : confirm.click(),
    ]);
    assert.equal(response.status(), 201, await response.text());
    return response;
  }

  const paper = { product_name: 'Giấy A4', code: 'PAPER-01', unit: 'ram', quantity: '1', line_total_vnd: '200000' };
  const supplier = 'Văn phòng phẩm An';
  await startReceipt({ supplier_name: supplier, total_vnd: '200000', paid_vnd: '0', items: [paper] });
  await summary.waitFor();
  assert.match(await summary.innerText(), /200\.000/);
  assert.equal(await form.locator('[data-receive-lines]').evaluate(el => el.open), false);
  const packed = await (await save(true)).json();
  assert.equal(packed.purchase.items[0].quantity.replace(/\.0+$/, ''), '100');
  assert.equal(packed.purchase.totalVnd, '200000');
  const paperStock = await page.evaluate(async ({ base, warehouseId, paper }) => {
    const stock = await window.Slink.fn.apiRequest(base + '/inventory?warehouseId=' + warehouseId);
    return stock.products.find(row => row.id === paper);
  }, seed);
  assert.equal(Number(paperStock.on_hand), 101);
  assert.equal(paperStock.cost_vnd, '2000');

  const newProduct = { product_name: 'Bút mới', unit: 'cây', quantity: '2', line_total_vnd: '25000' };
  await startReceipt({ supplier_name: supplier, total_vnd: '25000', paid_vnd: '10000', items: [newProduct] });
  await summary.waitFor();
  assert.equal(await form.locator('[name=method]').inputValue(), '');
  await form.getByRole('button', { name: 'Tạo nhanh' }).click();
  await form.locator('[data-new-price]').fill('20000');
  await form.getByRole('button', { name: 'Lưu mặt hàng', exact: true }).click();
  await form.locator('[data-photo-product-editor]').waitFor({ state: 'detached' });
  assert.equal(await form.locator('[data-purchase-quantity]').inputValue(), '2');
  assert.equal(await form.locator('[name=paymentState]').inputValue(), 'partial');
  await form.locator('[name=method]').selectOption('bank_transfer');
  const paidResponse = await save();
  const { purchase } = await paidResponse.json();

  // Replay the exact write after a simulated lost acknowledgement.
  const receiptId = await page.evaluate(async ({ endpoint, key, body }) => {
    const result = await window.Slink.fn.apiRequest(endpoint, { method: 'POST', headers: { 'idempotency-key': key }, body });
    return result.purchase.id;
  }, { endpoint: new URL(paidResponse.url()).pathname,
    key: await paidResponse.request().headerValue('idempotency-key'), body: paidResponse.request().postDataJSON() });
  assert.equal(receiptId, purchase.id);
  const ledger = await page.evaluate(async ({ base }) => {
    const request = window.Slink.fn.apiRequest;
    const [cashbook, debts] = await Promise.all([request(base + '/finance/cashbook'), request(base + '/finance/payables')]);
    return { paid: cashbook.balances.bank.outVnd, cash: cashbook.balances.cash.outVnd, due: debts.totalPayableVnd };
  }, seed);
  assert.deepEqual(ledger, { paid: '10000', cash: '0', due: '216000' });

  await startReceipt({ total_vnd: '220000', items: [paper] });
  await form.locator('[name=warehouseId]').selectOption(seed.otherWarehouseId);
  await form.locator('[name=note]').fill('Ghi chú trong lúc chờ');
  const useProposal = form.getByRole('button', { name: 'Dùng kết quả đọc ảnh' });
  await useProposal.waitFor();
  assert.equal(await summary.count(), 0);
  await useProposal.click();
  assert.equal(await form.locator('[name=note]').inputValue(), 'Ghi chú trong lúc chờ');
  assert.equal(await form.locator('[name=paymentState]').inputValue(), '');
  assert.equal(await form.locator('[data-receive-lines]').evaluate(el => el.open), true);
  assert.equal(await form.locator('[name=warehouseId]').inputValue(), seed.otherWarehouseId);
  assert.match(await summary.innerText(), /Kho phụ/);
  await form.locator('[name=paymentState]').selectOption('unpaid');
  await confirm.click();
  await form.getByRole('alert').filter({ hasText: 'Tổng tiền chưa khớp' }).waitFor();
  assert.ok(await form.isVisible());

  setFixture({ too_many_rows: true, items: [] });
  await form.locator('input[type=file]').setInputFiles({ name: 'retry.jpg', mimeType: 'image/jpeg', buffer: image });
  await page.getByText(/Phiếu có hơn 50 dòng/).first().waitFor();
  assert.match(await summary.innerText(), /Kho phụ/);
  assert.equal(await form.locator('[name=note]').inputValue(), 'Ghi chú trong lúc chờ');
}

async function run() {
  let fixture;
  const aiClient = { async parseInvoice() {
    await new Promise(resolve => setTimeout(resolve, 350));
    return fixture;
  } };
  const app = await bootTempApp({ aiClient });
  const browser = await launchBrowser(loadPlaywright().chromium);
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block' });
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await registerOwnerInBrowser(page, app.origin);
        await exerciseReceipt(page, next => { fixture = next; });
        assert.deepEqual(errors, []);
        console.log('PASS purchase photo with simulated OCR', viewport);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); await app.close(); }
}

module.exports = { exerciseReceipt };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
