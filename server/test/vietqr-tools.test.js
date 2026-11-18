'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const banks = require('../../banks-vn');
const vietqr = require('../../vietqr-tools');
const escpos = require('../../escpos-printer');

test('VN banks registry contains official NAPAS BIN codes', () => {
  assert.ok(banks.VN_BANKS.length >= 40);
  assert.equal(banks.findBankByCode('VCB')?.bin, '970436');
  assert.equal(banks.findBankByCode('TCB')?.bin, '970407');
  assert.equal(banks.findBankByCode('MB')?.bin, '970422');
  assert.equal(banks.findBankByBin('970418')?.shortName, 'BIDV');
});

test('VietQR EMVCo CRC-16/CCITT matches official vector and encodes TLV accurately', () => {
  assert.equal(vietqr.crc16Ccitt('123456789'), '29B1');

  const payload = vietqr.buildVietQrPayload({
    bankBin: '970436',
    accountNumber: '0123456789',
    amountVnd: '125000',
    description: 'SLINK ĐH-00105',
  });
  assert.ok(payload.startsWith('000201010212'));
  assert.ok(payload.includes('0010A000000727'));
  assert.ok(payload.includes('970436'));
  assert.ok(payload.includes('0123456789'));
  assert.ok(payload.includes('0208QRIBFTTA'));
  assert.ok(payload.includes('5303704'));
  assert.ok(payload.includes('5406125000'));
  assert.ok(payload.includes('SLINK DH-00105'));

  const bodyWithoutCrc = payload.slice(0, -4);
  const actualCrc = payload.slice(-4);
  assert.equal(actualCrc, vietqr.crc16Ccitt(bodyWithoutCrc));
});

test('Pure JS QR matrix encoder produces valid finder patterns & CSP-safe SVG', () => {
  const payload = vietqr.buildVietQrPayload({
    bankBin: '970422',
    accountNumber: '88889999',
    amountVnd: '50000',
    description: 'SLINK DH01',
  });
  const qr = vietqr.encodeQrMatrix(payload);
  assert.ok(qr.size >= 29);
  // Top-left 7x7 finder outer border must be dark modules
  for (let i = 0; i < 7; i += 1) {
    assert.equal(qr.modules[0][i], 1);
    assert.equal(qr.modules[6][i], 1);
    assert.equal(qr.modules[i][0], 1);
    assert.equal(qr.modules[i][6], 1);
  }
  const svg = vietqr.renderQrSvg(payload, { label: 'QR <script>alert(1)</script>' });
  assert.match(svg, /^<svg class='vietqr-svg'/);
  assert.ok(!svg.includes('<script>alert'));
  assert.ok(svg.includes('&lt;script&gt;'));

  // Version 8 (e.g., longer VietQR payload with account + amount + memo) MUST place alignment patterns overlapping row/col 6
  const v8Payload = vietqr.buildVietQrPayload({
    bankBin: '970436',
    accountNumber: '19036688999',
    amountVnd: '100000',
    description: 'SLINK TEST VIETQR LONGER PAYLOAD',
  });
  const qrV8 = vietqr.encodeQrMatrix(v8Payload);
  assert.equal(qrV8.size, 49);
  for (const [ar, ac] of [[6, 24], [24, 6], [24, 24], [24, 42], [42, 24], [42, 42]]) {
    assert.equal(qrV8.modules[ar][ac], 1, `center (${ar},${ac})`);
    assert.equal(qrV8.modules[ar - 1][ac], 0, `ring (${ar - 1},${ac})`);
    assert.equal(qrV8.modules[ar - 2][ac], 1, `outer (${ar - 2},${ac})`);
  }
});

test('ESC/POS receipt builder cleans Vietnamese text and emits standard ESC @ + GS V bytes', () => {
  const bytes = escpos.buildReceiptBytes({
    storeName: 'Tiệm Cà Phê Đá',
    orderNumber: 'DH-101',
    createdAt: '18/11/2026 19:30',
    items: [{ name: 'Bạc xỉu đá', qty: 3, unitPriceVnd: '29000', lineTotalVnd: '87000' }],
    subtotalVnd: '87000',
    discountVnd: 'bad-string',
    totalVnd: '87000',
    paidVnd: '87000',
    openDrawer: true,
  });
  assert.equal(bytes[0], 0x1b);
  assert.equal(bytes[1], 0x40);
  // Cash drawer kick command ESC p
  assert.equal(bytes[2], 0x1b);
  assert.equal(bytes[3], 0x70);
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.includes('Tiem Ca Phe Da'));
  assert.ok(text.includes('Luc: 18/11/2026 19:30'));
  assert.ok(text.includes('3 x 29.000 d'));
  assert.ok(text.includes('Bac xiu da'));
  // GS V partial cut near end
  assert.equal(bytes[bytes.length - 4], 0x1d);
  assert.equal(bytes[bytes.length - 3], 0x56);
});
