'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const barcode = require('../../barcode-tools');

test('barcode tools generate valid EAN-13 check digits and verify GS1 sample', () => {
  assert.equal(barcode.computeEan13CheckDigit('400638133393'), '1');
  assert.equal(barcode.isValidEan13('4006381333931'), true);
  assert.equal(barcode.computeEan13CheckDigit('893850597419'), '4');
  assert.equal(barcode.isValidEan13('8938505974194'), true);
  assert.equal(barcode.isValidEan13('8938505974190'), false);

  for (let i = 0; i < 20; i += 1) {
    const code = barcode.generateEan13('20');
    assert.match(code, /^20\d{11}$/);
    assert.equal(barcode.isValidEan13(code), true);
  }
});

test('barcode tools encode Code128B cleanly with start/check/stop modules', () => {
  const encoded = barcode.encodeCode128B('SKU-01');
  assert.ok(encoded);
  assert.equal(encoded.text, 'SKU-01');
  // 1 Start + 6 data + 1 checksum + 1 stop = 9 symbols -> 8*11 + 13 = 101 modules
  assert.equal(encoded.totalModules, 101);
  assert.ok(encoded.bars.length > 20);

  const svg = barcode.renderBarcodeSvg('8938505974192');
  assert.match(svg, /^<svg class='barcode-svg'/);
  assert.ok(svg.includes('8938505974192'));
  assert.ok(svg.includes('<rect '));
});

test('barcode tools escape XSS in product names, SKU and store names on print sheets', () => {
  const html = barcode.buildBarcodeSheetHtml({
    storeName: '<script>alert(1)</script>',
    paper: 'thermal-2up',
    items: [
      {
        name: '<img src=x onerror=alert(2)>',
        sku: 'CF"<01>',
        barcode: '8938505974192',
        priceVnd: 35000,
        copies: 2,
      },
    ],
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('35.000 ₫'));
  assert.equal((html.match(/class='barcode-sticker'/g) || []).length, 2);
});
