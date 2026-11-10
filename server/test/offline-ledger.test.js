'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../../offline-ledger');
const userId = 'user', storeId = 'store', warehouseId = 'warehouse', productId = 'product';
const session = { user: { id: userId }, stores: [{ id: storeId, role: 'owner' }] };
const responses = [
  { url: '/api/stores/store/warehouses', fetchedAt: '2026-11-03T10:00:00Z', value: { warehouses: [{ id: warehouseId, is_default: true }] } },
  { url: '/api/stores/store/products?warehouseId=warehouse', fetchedAt: '2026-11-03T10:00:00Z', value: { products: [{ id: productId, name: 'Mặt hàng', inventory_tracked: true, on_hand: '12', sale_price_vnd: '80000', inventory_version: 1 }] } },
  { url: '/api/stores/store/cash-register', fetchedAt: '2026-11-03T10:00:00Z', value: { session: { id: 'shift', expectedCashVnd: '100000' } } },
];
const operation = (kind, payload, sequence) => ({ userId, storeId, key: 'offline-operation-' + sequence, kind, payload, sequence, state: 'ready', queuedAt: '2026-11-03T10:10:00Z' });
const sale = (quantity = '1') => ({ warehouseId, items: [{ productId, quantity, expectedUnitPriceVnd: '80000' }], totalVnd: String(Number(quantity) * 80000), discountVnd: '0', tenders: [{ method: 'cash', amountReceivedVnd: '100000' }] });

test('offline ledger keeps sale, change, receipt, count, expense and shift arithmetic aligned', () => {
  const queue = [];
  let state = ledger.validateEnqueue(responses, queue, operation('sale', sale(), 1), session);
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).on_hand, '11');
  assert.equal(state.session.expectedCashVnd, '180000');
  assert.equal(state.localOrders[0].changeVnd, '20000');
  queue.push(operation('sale', sale(), 1));
  const receipt = operation('purchase', { warehouseId, items: [{ productId, quantity: '5', unitCostVnd: '10000' }], amountPaidVnd: '50000', method: 'cash' }, 2);
  state = ledger.validateEnqueue(responses, queue, receipt, session); queue.push(receipt);
  assert.equal(state.session.expectedCashVnd, '130000');
  const count = operation('stock-count', { warehouseId, productId, count: '15', expectedInventoryVersion: 3 }, 3);
  state = ledger.validateEnqueue(responses, queue, count, session); queue.push(count);
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).on_hand, '15');
  const expense = operation('cash', { direction: 'out', amountVnd: '10000', method: 'cash' }, 4);
  state = ledger.validateEnqueue(responses, queue, expense, session); queue.push(expense);
  assert.equal(state.session.expectedCashVnd, '120000');
  state = ledger.validateEnqueue(responses, queue, operation('shift-close', { countedCashVnd: '120000' }, 5), session);
  assert.equal(state.session, null);
  assert.equal(responses[1].value.products[0].on_hand, '12', 'canonical snapshot is never mutated');
});

test('offline pack receipt uses base stock and keeps exact payment before a per-item sale', () => {
  const receipt = operation('purchase', { warehouseId, items: [{ productId, quantity: '24', unitCostVnd: '4167', pack: { name: 'thùng', size: '24', quantity: '1', unitCostVnd: '100000' } }], amountPaidVnd: '100000', method: 'cash' }, 1);
  let state = ledger.validateEnqueue(responses, [], receipt, session);
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).on_hand, '36');
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).purchase_pack.size, '24');
  assert.equal(state.session.expectedCashVnd, '0', 'invoice stays 100000, not 100008');
  const projected = ledger.projectResponse(responses[1].url, responses[1].value, responses, [receipt], userId);
  assert.equal(projected.products[0].purchase_pack.size, '24', 'remember pack defaults while acknowledgement is delayed');
  state = ledger.validateEnqueue(responses, [receipt], operation('sale', sale(), 2), session);
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).on_hand, '35');
  assert.equal(state.session.expectedCashVnd, '80000');
  assert.throws(() => ledger.validateEnqueue(responses, [], { ...receipt, payload: { ...receipt.payload, items: [{ ...receipt.payload.items[0], quantity: '23' }] } }, session), error => error.code === 'purchase_pack_invalid');
});

test('offline validation rejects overselling, price/version conflicts, short cash, wrong account and role', () => {
  const cases = [
    [operation('sale', sale('13'), 1), 'offline_insufficient_stock'],
    [operation('sale', { ...sale(), totalVnd: '79999' }, 1), 'offline_total_changed'],
    [operation('sale', { ...sale(), items: [{ productId, quantity: 1, expectedUnitPriceVnd: '79000' }] }, 1), 'offline_price_changed'],
    [operation('stock-count', { warehouseId, productId, count: 10, expectedInventoryVersion: 2 }, 1), 'inventory_version_conflict'],
    [operation('cash', { method: 'cash', direction: 'out', amountVnd: '100001' }, 1), 'offline_insufficient_cash'],
    [operation('shift-close', { countedCashVnd: '99999' }, 1), 'offline_cash_variance_reason'],
  ];
  for (const [candidate, code] of cases) assert.throws(() => ledger.validateEnqueue(responses, [], candidate, session), e => e.code === code);
  assert.throws(() => ledger.validateEnqueue(responses, [], operation('sale', sale(), 1), { ...session, user: { id: 'someone-else' } }), e => e.code === 'offline_forbidden');
  assert.throws(() => ledger.validateEnqueue(responses, [], operation('cash', { amountVnd: 1, method: 'cash', direction: 'in' }, 1), { ...session, stores: [{ id: storeId, role: 'cashier' }] }), e => e.code === 'offline_forbidden');
});

test('offline projection subtracts queued stock once and excludes acknowledged operations', () => {
  const first = operation('sale', sale('6'), 1);
  first.payload.tenders[0].amountReceivedVnd = '480000';
  assert.throws(() => ledger.validateEnqueue(responses, [first], operation('sale', sale('7'), 2), session), e => e.code === 'offline_insufficient_stock');
  const state = ledger.derive(responses, [{ ...first, state: 'acknowledged' }]);
  assert.equal(state.products.get(ledger.productKey(warehouseId, productId)).on_hand, '12');
  assert.equal(ledger.lineTotal('10001', 500), 5001n);
  assert.throws(() => ledger.amount('1.2'));
  assert.throws(() => ledger.quantity('0.0001'));
});

test('warehouse snapshots do not borrow aggregate stock and shared product versions follow receipts', () => {
  const warehouses = { ...responses[0], value: { warehouses: [{ id: warehouseId, is_default: true }, { id: 'other', is_default: false }] } };
  const one = { ...responses[1], value: { products: [{ ...responses[1].value.products[0], version: 2, on_hand: '2', reserved: '1' }] } };
  const other = { ...one, url: '/api/stores/store/products?warehouseId=other', value: { products: [{ ...one.value.products[0], version: 1, on_hand: '3', reserved: '0' }] } };
  const aggregate = { ...one, url: '/api/stores/store/products', value: { products: [{ ...one.value.products[0], version: 3, on_hand: '999' }] } };
  const cached = [warehouses, one, other, aggregate, responses[2]];
  let state = ledger.derive(cached, []);
  assert.equal(state.products.get('warehouse|product').on_hand, '2');
  assert.equal(state.products.get('other|product').on_hand, '3');
  assert.equal(state.products.get('other|product').version, 3);
  assert.throws(() => ledger.validateEnqueue(cached, [], operation('sale', sale(2), 1), session), e => e.code === 'offline_insufficient_stock');
  const receipt = operation('purchase', { warehouseId, items: [{ productId, quantity: '1', unitCostVnd: '20000', expectedProductVersion: 3 }], amountPaidVnd: 20000, method: 'cash' }, 1);
  state = ledger.validateEnqueue(cached, [], receipt, session);
  assert.equal(state.products.get('other|product').on_hand, '3');
  assert.equal(state.products.get('other|product').version, 4);
  assert.equal(state.products.get('other|product').cost_vnd, '20000');
  const later = operation('purchase', { warehouseId: 'other', items: [{ productId, quantity: '1', unitCostVnd: '21000', expectedProductVersion: 4 }], amountPaidVnd: 21000, method: 'cash' }, 2);
  assert.equal(ledger.validateEnqueue(cached, [receipt], later, session).products.get('warehouse|product').version, 5);
});

test('cached daily finance excludes queued entries from another business day', () => {
  const finance = { movements: [], suppliers: [], customerDebtors: [], summary: { todayInVnd: '5000', todayOutVnd: '0', customerDebtVnd: '0', supplierPayableVnd: '0' }, offlineCachedAt: '2026-11-03T16:00:00Z' };
  const beforeMidnight = operation('cash', { amountVnd: 1000, direction: 'in', method: 'cash', offline: { occurredAt: '2026-11-03T16:30:00Z' } }, 1);
  const afterMidnight = operation('cash', { amountVnd: 2000, direction: 'in', method: 'cash', offline: { occurredAt: '2026-11-03T17:30:00Z' } }, 2);
  const result = ledger.projectResponse('/api/stores/store/finance', finance, responses, [beforeMidnight, afterMidnight], userId);
  assert.equal(result.summary.todayInVnd, '6000');
  assert.equal(result.movements.length, 2, 'all pending entries remain visible with their own dates');
});
