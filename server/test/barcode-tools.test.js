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

  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const code = barcode.generateUniqueEan13(seen, '20');
    assert.equal(barcode.isValidEan13(code), true);
  }
  assert.equal(seen.size, 50);
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

  // Verify 49..80 char printable ASCII preserves exact characters without 48-char truncation
  const longAscii = 'SKU-LONG-' + 'A1B2C3D4E5'.repeat(7);
  assert.equal(longAscii.length, 79);
  const longEncoded = barcode.encodeCode128B(longAscii);
  assert.equal(longEncoded?.text, longAscii);

  // Verify Vietnamese/non-ASCII codes fail explicitly rather than printing an altered barcode
  assert.equal(barcode.encodeCode128B('MÃ-ĐÁ-01'), null);
  const rejectedSvg = barcode.renderBarcodeSvg('MÃ-ĐÁ-01');
  assert.ok(rejectedSvg.includes('barcode-svg-empty'));
  assert.equal(barcode.encodeCode128B('X'.repeat(81)), null);
});

test('barcode tools escape XSS and cap total printed stickers cleanly', () => {
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

  const truncatedSheet = barcode.buildBarcodeSheetHtml({
    storeName: 'Shop',
    items: Array.from({ length: 10 }, (_, idx) => ({
      name: `SP ${idx}`,
      sku: `SKU-${idx}`,
      barcode: '2000000000122',
      priceVnd: 10000,
      copies: 100,
    })),
  });
  assert.equal((truncatedSheet.match(/class='barcode-sticker'/g) || []).length, barcode.MAX_STICKERS);
  assert.ok(truncatedSheet.includes('barcode-sheet-cap-note'));
});
