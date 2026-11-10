'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const money=require('../../money-inputs');
test('VND input groups whole dong without losing large values or accepting fractions',()=>{
  assert.equal(money.format('230000'),'230.000');
  assert.equal(money.raw('1.234.567'),'1234567');
  assert.equal(money.raw('100,000'),'100000');
  assert.equal(money.format('9007199254740991'),'9.007.199.254.740.991');
  assert.equal(money.raw('-1000'),'-1000');
  assert.equal(money.raw('1.5'),'1.5');
  assert.equal(money.raw(''), '');
});
