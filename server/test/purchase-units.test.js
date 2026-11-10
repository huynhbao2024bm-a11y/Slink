'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fromPack } = require('../../purchase-units');

test('pack conversion preserves base quantity and exact invoice money', () => {
  const paper = fromPack({ name: 'lô', size: '100', quantity: '1', unitCostVnd: '10000' });
  assert.equal(paper.quantity, '100');
  assert.equal(paper.unitCostVnd, 100n);
  assert.equal(paper.lineTotalVnd, 10000n);
  const bottles = fromPack({ name: 'thùng', size: 24, quantity: '1.5', unitCostVnd: '100000' });
  assert.equal(bottles.quantity, '36');
  assert.equal(bottles.unitCostVnd, 4167n);
  assert.equal(bottles.lineTotalVnd, 150000n, 'do not multiply rounded base cost into invoice total');
  assert.equal(fromPack({ name: 'hộp', size: 3, quantity: '0.5', unitCostVnd: '10001' }).lineTotalVnd, 5001n);
});

test('pack conversion rejects incomplete, nonintegral size and storage overflow', () => {
  const valid = { name: 'lô', size: '100', quantity: '1', unitCostVnd: '10000' };
  for (const override of [{ name: '' }, { size: '0' }, { size: '1.5' }, { size: '1000001' }, { quantity: '0' }, { quantity: '0.0001' }, { unitCostVnd: '-1' }, { unitCostVnd: '1.2' }, { unitCostVnd: '9223372036854775808' }, { size: '1000000', quantity: '10000' }]) {
    assert.throws(() => fromPack({ ...valid, ...override }), error => error.code === 'purchase_pack_invalid');
  }
});
