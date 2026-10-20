'use strict';

const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { buildServer } = require('../server');
const { withStore } = require('../server/db');

const ORIGIN = 'http://slink-acceptance.invalid';
const PASSWORD = 'Native acceptance only 2026!';

function databaseTarget(value, role, expectedDatabase) {
  let target;
  try { target = new URL(value); } catch { throw new Error(`${role} connection URL is missing or invalid.`); }
  const database = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
      || !['127.0.0.1', 'localhost'].includes(target.hostname)
      || target.port !== '5433'
      || decodeURIComponent(target.username) !== role
      || database !== expectedDatabase) {
    throw new Error(`${role} must target the isolated Slink PostgreSQL acceptance database on local port 5433.`);
  }
  return target;
}

function cookiesFrom(response) {
  const setCookies = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie']
    : [response.headers['set-cookie']];
  return Object.fromEntries(setCookies.filter(Boolean).map((value) => {
    const [pair] = value.split(';');
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function cookieHeader(cookies) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
}

function requireStatus(response, expected, label) {
  assert.equal(response.statusCode, expected, `${label}: ${response.body}`);
}

function assertQuantity(actual, expected, label) {
  function milli(value) {
    const match = /^(0|[1-9]\d*)(?:\.(\d{1,3}))?$/.exec(String(value));
    assert.ok(match, `${label}: invalid quantity ${value}`);
    return BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
  }
  assert.equal(milli(actual), milli(expected), label);
}

async function registerSyntheticStore(app, { email, displayName, storeName }) {
  const registration = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { origin: ORIGIN },
    payload: { email, displayName, storeName, password: PASSWORD },
  });
  requireStatus(registration, 201, 'Second synthetic account registration');
  const verificationUrl = registration.json().developmentVerificationUrl;
  assert.ok(verificationUrl, 'test mode returns a one-time verification URL without sending email');
  const token = new URLSearchParams(new URL(verificationUrl).hash.slice(1)).get('token');
  assert.ok(token);
  const verification = await app.inject({
    method: 'POST', url: '/api/auth/verify-email', headers: { origin: ORIGIN }, payload: { token },
  });
  requireStatus(verification, 200, 'Second synthetic email verification');
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD },
  });
  requireStatus(login, 200, 'Second synthetic sign-in');
  const cookies = cookiesFrom(login);
  return { store: login.json().stores?.[0], cookies };
}

async function run() {
  const databaseName = process.env.SLINK_ACCEPTANCE_DATABASE || '';
  if (!/^slink_accept_[a-f0-9]{12}$/.test(databaseName)) {
    throw new Error('Refusing to run: the temporary database name was not created by the local acceptance wrapper.');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run the acceptance flow in production mode.');
  databaseTarget(process.env.APP_DATABASE_URL, 'slink_app', databaseName);
  databaseTarget(process.env.MIGRATION_DATABASE_URL, 'slink_migrator', databaseName);

  const pool = new Pool({
    connectionString: process.env.APP_DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 5000,
    application_name: 'slink-native-acceptance',
  });
  const app = await buildServer({
    pool,
    logger: false,
    env: { NODE_ENV: 'test', PUBLIC_ORIGIN: ORIGIN },
  });

  try {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    requireStatus(health, 200, 'API liveness');
    const readiness = await app.inject({ method: 'GET', url: '/api/ready' });
    requireStatus(readiness, 200, 'Database readiness');
    assert.equal(readiness.json().status, 'ready');
    process.stdout.write('PASS native API readiness through the PostgreSQL application role\n');

    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const email = `native-acceptance-${suffix}@slink.invalid`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: ORIGIN },
      payload: { email, displayName: 'Chủ cửa hàng nghiệm thu', storeName: 'Cửa hàng nghiệm thu tạm', password: PASSWORD },
    });
    requireStatus(registration, 201, 'Synthetic account registration');
    const verificationUrl = registration.json().developmentVerificationUrl;
    assert.ok(verificationUrl, 'temporary acceptance uses the local one-time verification link');
    const verificationToken = new URLSearchParams(new URL(verificationUrl).hash.slice(1)).get('token');
    assert.ok(verificationToken);
    const verified = await app.inject({
      method: 'POST', url: '/api/auth/verify-email', headers: { origin: ORIGIN }, payload: { token: verificationToken },
    });
    requireStatus(verified, 200, 'Synthetic account email verification');

    const login = await app.inject({
      method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { email, password: PASSWORD },
    });
    requireStatus(login, 200, 'Synthetic account sign-in');
    const cookies = cookiesFrom(login);
    assert.ok(cookies.slink_session && cookies.slink_csrf, 'sign-in sets session and CSRF cookies');
    const store = login.json().stores?.[0];
    const userId = login.json().user?.id;
    assert.ok(store?.id, 'registration provisions one isolated store');
    assert.ok(userId, 'sign-in returns the synthetic store owner ID');
    const headers = { cookie: cookieHeader(cookies) };
    const writeHeaders = { ...headers, origin: ORIGIN, 'x-csrf-token': cookies.slink_csrf };
    process.stdout.write('PASS registration, one-time verification, session and store provisioning\n');

    const item = {
      sku: `NATIVE-${suffix}`,
      name: 'Hàng nghiệm thu PostgreSQL',
      salePriceVnd: 15000,
      costVnd: 9000,
      lowStockThreshold: '1',
      openingQuantity: '2',
    };
    const preview = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import/preview`, headers: writeHeaders, payload: { items: [item] },
    });
    requireStatus(preview, 200, 'Opening-stock import preview');
    assert.equal(preview.json().valid, true);
    const importHeaders = { ...writeHeaders, 'idempotency-key': `native-import-${suffix}-001` };
    const imported = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import`, headers: importHeaders, payload: { items: [item] },
    });
    requireStatus(imported, 201, 'Product import and opening stock');
    const product = imported.json().products?.[0];
    assert.ok(product?.id);
    assertQuantity(product.on_hand, '2.000', 'Opening inventory quantity');
    const importReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import`, headers: importHeaders, payload: { items: [item] },
    });
    requireStatus(importReplay, 201, 'Idempotent import retry');
    assert.equal(importReplay.headers['idempotent-replayed'], 'true');
    const importedPriceHistory = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/products/${product.id}/price-history`, headers,
    });
    requireStatus(importedPriceHistory, 200, 'Native imported product sale-price history');
    assert.equal(importedPriceHistory.json().history.length, 1);
    assert.equal(importedPriceHistory.json().history[0].source_type, 'csv_import');
    assert.equal(importedPriceHistory.json().history[0].new_price_vnd, '15000');
    assert.equal(importedPriceHistory.json().history[0].source_id, imported.json().importId);
    process.stdout.write('PASS catalog import preview, opening inventory and duplicate-submit protection\n');

    const channelItem = {
      sku: `NATIVE-CHANNEL-${suffix}`,
      name: 'Hàng đơn kênh nghiệm thu',
      salePriceVnd: 18000,
      costVnd: 8000,
      openingQuantity: '3',
    };
    const channelProductResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-product-${suffix}-01` },
      payload: { items: [channelItem] },
    });
    requireStatus(channelProductResult, 201, 'Channel order acceptance product');
    const channelProductId = channelProductResult.json().products[0]?.id;
    assert.ok(channelProductId, 'channel order product was created in the temporary store');
    const warehousesResult = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/warehouses`, headers });
    requireStatus(warehousesResult, 200, 'Channel order fulfillment warehouses');
    const channelWarehouse = warehousesResult.json().warehouses.find((warehouse) => warehouse.is_default && warehouse.status === 'active')
      || warehousesResult.json().warehouses.find((warehouse) => warehouse.status === 'active');
    assert.ok(channelWarehouse?.id, 'temporary store has an active fulfillment warehouse');
    const profileResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-profiles`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-profile-${suffix}-01` },
      payload: { channelCode: 'shopee', shopLabel: `Gian hàng nghiệm thu ${suffix}` },
    });
    requireStatus(profileResult, 201, 'Manual channel profile');
    const channelProfileId = profileResult.json().profile?.id;
    assert.ok(channelProfileId);
    assert.equal(profileResult.json().profile.connection_status, 'not_connected', 'manual entry does not claim provider connection');
    const mappingResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-mappings`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-mapping-${suffix}-01` },
      payload: { channelProfileId, productId: channelProductId, externalSku: `SH-${suffix}` },
    });
    requireStatus(mappingResult, 201, 'Manual channel SKU mapping');
    const channelMappingId = mappingResult.json().mapping?.id;
    assert.ok(channelMappingId);
    const orderCatalog = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/channel-order-catalog?profileId=${channelProfileId}`, headers,
    });
    requireStatus(orderCatalog, 200, 'Mapped channel order catalog');
    assert.ok(orderCatalog.json().mappings.some((mapping) => mapping.mappingId === channelMappingId));

    const businessCounts = () => withStore(pool, userId, store.id, async (client) => {
      const counts = await client.query(`
        SELECT (SELECT COUNT(*)::int FROM orders WHERE store_id = $1) AS sales_orders,
               (SELECT COUNT(*)::int FROM payments WHERE store_id = $1) AS payments,
               (SELECT COUNT(*)::int FROM cash_movements WHERE store_id = $1) AS cash_movements,
               (SELECT COUNT(*)::int FROM customer_ledger_entries WHERE store_id = $1) AS customer_ledger,
               (SELECT COUNT(*)::int FROM supplier_ledger_entries WHERE store_id = $1) AS supplier_ledger
      `, [store.id]);
      return counts.rows[0];
    });
    const financeBeforeChannelOrder = await businessCounts();
    const channelOrderPayload = {
      channelProfileId, warehouseId: channelWarehouse.id, externalOrderRef: `SH-NATIVE-${suffix}`,
      paymentStatusSnapshot: 'cod', customerName: 'Người nhận nghiệm thu',
      items: [{ mappingId: channelMappingId, quantity: '2', unitPriceVnd: '12500' }],
    };
    const channelCreateHeaders = { ...writeHeaders, 'idempotency-key': `native-channel-order-${suffix}-001` };
    const channelCreated = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders`, headers: channelCreateHeaders, payload: channelOrderPayload,
    });
    requireStatus(channelCreated, 201, 'Manual channel order with inventory reservation');
    const channelOrder = channelCreated.json().order;
    assert.equal(channelOrder.fulfillmentStatus, 'reserved');
    assert.equal(channelOrder.paymentStatusSnapshot, 'cod');
    assert.equal(channelOrder.totalVnd, '25000');
    const channelCreateReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders`, headers: channelCreateHeaders, payload: channelOrderPayload,
    });
    requireStatus(channelCreateReplay, 201, 'Idempotent channel-order creation retry');
    assert.equal(channelCreateReplay.headers['idempotent-replayed'], 'true');
    assert.equal(channelCreateReplay.json().order.id, channelOrder.id);
    const duplicateChannelRef = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-duplicate-${suffix}-1` },
      payload: { ...channelOrderPayload, externalOrderRef: channelOrderPayload.externalOrderRef.toLowerCase() },
    });
    requireStatus(duplicateChannelRef, 409, 'Duplicate external channel order reference');
    assert.equal(duplicateChannelRef.json().error.code, 'channel_order_exists');
    const stockAfterReserve = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products?q=${channelItem.sku}`, headers });
    requireStatus(stockAfterReserve, 200, 'Channel stock after reservation');
    assertQuantity(stockAfterReserve.json().products[0]?.on_hand, '3', 'Channel reservation does not change on-hand stock');
    assertQuantity(stockAfterReserve.json().products[0]?.reserved, '2', 'Channel reservation is durable');
    const channelOversell = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-oversell-${suffix}-1` },
      payload: { ...channelOrderPayload, externalOrderRef: `SH-OVERSELL-${suffix}`, items: [{ mappingId: channelMappingId, quantity: '2', unitPriceVnd: '12500' }] },
    });
    requireStatus(channelOversell, 409, 'Channel oversell rejection');
    assert.equal(channelOversell.json().error.code, 'insufficient_channel_stock');
    const channelOrdersAfterOversell = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/channel-orders`, headers });
    requireStatus(channelOrdersAfterOversell, 200, 'Channel order list after rejected oversell');
    assert.equal(channelOrdersAfterOversell.json().total, 1, 'failed reservation creates no order');
    const channelPacked = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders/${channelOrder.id}/status`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-packed-${suffix}-1` },
      payload: { status: 'packed', version: 1 },
    });
    requireStatus(channelPacked, 200, 'Channel order packing');
    const channelShippedHeaders = { ...writeHeaders, 'idempotency-key': `native-channel-shipped-${suffix}-1` };
    const channelShippedPayload = { status: 'shipped', version: 2 };
    const channelShipped = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders/${channelOrder.id}/status`,
      headers: channelShippedHeaders, payload: channelShippedPayload,
    });
    requireStatus(channelShipped, 200, 'Channel order shipment and stock issue');
    const channelShippedReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders/${channelOrder.id}/status`,
      headers: channelShippedHeaders, payload: channelShippedPayload,
    });
    requireStatus(channelShippedReplay, 200, 'Idempotent channel shipment retry');
    assert.equal(channelShippedReplay.headers['idempotent-replayed'], 'true');
    const stockAfterShip = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products?q=${channelItem.sku}`, headers });
    requireStatus(stockAfterShip, 200, 'Channel stock after shipment');
    assertQuantity(stockAfterShip.json().products[0]?.on_hand, '1', 'Shipment deducts reserved physical stock exactly once');
    assertQuantity(stockAfterShip.json().products[0]?.reserved, '0', 'Shipment releases the reservation');
    const channelMovements = await withStore(pool, userId, store.id, (client) => client.query(
      "SELECT COUNT(*)::int AS count FROM inventory_movements WHERE store_id = $1 AND source_type = 'channel_order' AND source_id = $2 AND movement_type = 'sale'",
      [store.id, channelOrder.id]
    ));
    assert.equal(channelMovements.rows[0].count, 1, 'shipment writes one durable stock-ledger entry');
    const channelDelivered = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders/${channelOrder.id}/status`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-delivered-${suffix}-1` },
      payload: { status: 'delivered', version: 3 },
    });
    requireStatus(channelDelivered, 200, 'Channel order delivery status');
    const channelDetail = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/channel-orders/${channelOrder.id}`, headers });
    requireStatus(channelDetail, 200, 'Channel order and immutable status history');
    assert.deepEqual(channelDetail.json().events.map((event) => event.toStatus), ['reserved', 'packed', 'shipped', 'delivered']);

    const cancelChannelOrder = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-cancel-create-${suffix}-1` },
      payload: { ...channelOrderPayload, externalOrderRef: `SH-CANCEL-${suffix}`, items: [{ mappingId: channelMappingId, quantity: '1', unitPriceVnd: '12500' }] },
    });
    requireStatus(cancelChannelOrder, 201, 'Second channel order for cancellation');
    const cancelled = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/channel-orders/${cancelChannelOrder.json().order.id}/status`,
      headers: { ...writeHeaders, 'idempotency-key': `native-channel-cancel-${suffix}-1` },
      payload: { status: 'cancelled', version: 1, reason: 'Người mua hủy trước khi gửi' },
    });
    requireStatus(cancelled, 200, 'Channel cancellation releases reserved stock');
    const stockAfterCancel = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products?q=${channelItem.sku}`, headers });
    requireStatus(stockAfterCancel, 200, 'Channel stock after cancellation');
    assertQuantity(stockAfterCancel.json().products[0]?.on_hand, '1', 'Cancellation does not change on-hand stock');
    assertQuantity(stockAfterCancel.json().products[0]?.reserved, '0', 'Cancellation releases held stock');
    const channelCsv = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/exports/channel-orders?warehouseId=${channelWarehouse.id}`, headers,
    });
    requireStatus(channelCsv, 200, 'Native channel-order CSV export');
    assert.match(channelCsv.headers['content-type'] || '', /text\/csv/i);
    assert.ok(channelCsv.body.startsWith('\uFEFF'));
    assert.ok(channelCsv.body.includes(channelOrderPayload.externalOrderRef));
    assert.ok(channelCsv.body.includes(`SH-CANCEL-${suffix}`));
    assert.ok(channelCsv.body.includes('cod'));
    assert.deepEqual(await businessCounts(), financeBeforeChannelOrder, 'manual channel-order payment snapshot creates no Slink revenue, debt, payment, or cash movement');
    process.stdout.write('PASS native manual channel orders, idempotency, reservation, shipment ledger, cancellation, scoped CSV export, tenant-safe history and finance isolation\n');

    const secondTenant = await registerSyntheticStore(app, {
      email: `native-isolation-${suffix}@slink.invalid`,
      displayName: 'Chủ cửa hàng cách ly',
      storeName: 'Cửa hàng cách ly nghiệm thu',
    });
    assert.ok(secondTenant.store?.id && secondTenant.store.id !== store.id, 'second account provisions an independent store');
    const secondHeaders = { cookie: cookieHeader(secondTenant.cookies) };
    const secondOwnCatalog = await app.inject({
      method: 'GET', url: `/api/stores/${secondTenant.store.id}/products`, headers: secondHeaders,
    });
    requireStatus(secondOwnCatalog, 200, 'Second store catalog');
    assert.equal(secondOwnCatalog.json().products.length, 0, 'new second store begins without another store\'s products');
    const crossStoreRead = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/products`, headers: secondHeaders,
    });
    requireStatus(crossStoreRead, 403, 'Cross-store catalog read');
    const crossStoreChannelOrders = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/channel-orders`, headers: secondHeaders,
    });
    requireStatus(crossStoreChannelOrders, 403, 'Cross-store channel-order read');
    const crossStorePriceHistory = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/products/${product.id}/price-history`, headers: secondHeaders,
    });
    requireStatus(crossStorePriceHistory, 403, 'Cross-store sale-price history read');
    const crossStoreWrite = await app.inject({
      method: 'POST',
      url: `/api/stores/${store.id}/products`,
      headers: { ...secondHeaders, origin: ORIGIN, 'x-csrf-token': secondTenant.cookies.slink_csrf },
      payload: { sku: `CROSS-${suffix}`, name: 'Không được ghi chéo cửa hàng', salePriceVnd: 1 },
    });
    requireStatus(crossStoreWrite, 403, 'Cross-store catalog write');
    const firstStoreAfterDeniedWrite = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/products`, headers,
    });
    requireStatus(firstStoreAfterDeniedWrite, 200, 'First-store catalog after denied cross-store write');
    assert.equal(firstStoreAfterDeniedWrite.json().products.length, 1, 'denied cross-store write leaves the first store unchanged');
    process.stdout.write('PASS native two-store isolation denies cross-store reads and writes\n');

    const opened = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/cash-register/open`,
      headers: { ...writeHeaders, 'idempotency-key': `native-shift-${suffix}-001` },
      payload: { openingFloatVnd: '0' },
    });
    requireStatus(opened, 201, 'Cash session open');

    const salePayload = { items: [{ productId: product.id, quantity: 1 }], method: 'cash', amountReceivedVnd: '15000' };
    const saleHeaders = { ...writeHeaders, 'idempotency-key': `native-sale-${suffix}-001` };
    const sale = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/sales`, headers: saleHeaders, payload: salePayload,
    });
    requireStatus(sale, 201, 'Cash sale');
    assert.equal(sale.json().order.totalVnd, '15000');
    const saleReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/sales`, headers: saleHeaders, payload: salePayload,
    });
    requireStatus(saleReplay, 201, 'Idempotent sale retry');
    assert.equal(saleReplay.headers['idempotent-replayed'], 'true');

    const afterSale = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(afterSale, 200, 'Inventory after sale');
    assertQuantity(afterSale.json().products.find((row) => row.id === product.id)?.on_hand, '1.000', 'Inventory after sale');
    const oversell = await app.inject({
      method: 'POST',
      url: `/api/stores/${store.id}/sales`,
      headers: { ...writeHeaders, 'idempotency-key': `native-oversell-${suffix}-01` },
      payload: { items: [{ productId: product.id, quantity: 2 }], tenders: [] },
    });
    requireStatus(oversell, 409, 'Oversell prevention');
    assert.equal(oversell.json().error.code, 'insufficient_stock');
    process.stdout.write('PASS cash sale, inventory ledger, idempotent retry and oversell rejection\n');

    const orderId = sale.json().order.id;
    const detail = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/orders/${orderId}`, headers });
    requireStatus(detail, 200, 'Order detail');
    const orderLineId = detail.json().order.items?.[0]?.id;
    assert.ok(orderLineId);
    const returnPayload = {
      items: [{ orderLineId, quantity: 1 }],
      reason: 'Nghiệm thu trả hàng trên cơ sở dữ liệu tạm',
      restockPolicy: 'restock',
      refundMethod: 'bank_transfer',
    };
    const returnHeaders = { ...writeHeaders, 'idempotency-key': `native-return-${suffix}-001` };
    const returned = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/orders/${orderId}/returns`, headers: returnHeaders, payload: returnPayload,
    });
    requireStatus(returned, 201, 'Full return and refund ledger');
    assert.equal(returned.json().return.orderStatus, 'returned');
    const returnReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/orders/${orderId}/returns`, headers: returnHeaders, payload: returnPayload,
    });
    requireStatus(returnReplay, 201, 'Idempotent return retry');
    assert.equal(returnReplay.headers['idempotent-replayed'], 'true');
    const returnedOrder = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/orders?q=${encodeURIComponent(item.sku)}&status=returned`, headers,
    });
    requireStatus(returnedOrder, 200, 'Returned order search by SKU');
    assert.deepEqual(returnedOrder.json().orders.map((row) => row.id), [orderId]);
    const afterReturn = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(afterReturn, 200, 'Inventory after return');
    assertQuantity(afterReturn.json().products.find((row) => row.id === product.id)?.on_hand, '2.000', 'Inventory after return');
    process.stdout.write('PASS full return, refund record, stock restoration and searchable order history\n');

    const contestedSale = {
      items: [{ productId: product.id, quantity: 2 }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: '30000' }],
    };
    const concurrentSales = await Promise.all([
      app.inject({
        method: 'POST', url: `/api/stores/${store.id}/sales`,
        headers: { ...writeHeaders, 'idempotency-key': `native-concurrent-${suffix}-a` }, payload: contestedSale,
      }),
      app.inject({
        method: 'POST', url: `/api/stores/${store.id}/sales`,
        headers: { ...writeHeaders, 'idempotency-key': `native-concurrent-${suffix}-b` }, payload: contestedSale,
      }),
    ]);
    assert.deepEqual(concurrentSales.map((response) => response.statusCode).sort(), [201, 409]);
    const rejectedConcurrentSale = concurrentSales.find((response) => response.statusCode === 409);
    assert.equal(rejectedConcurrentSale.json().error.code, 'insufficient_stock');
    const afterConcurrentSale = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(afterConcurrentSale, 200, 'Inventory after competing native sales');
    assertQuantity(afterConcurrentSale.json().products.find((row) => row.id === product.id)?.on_hand, '0.000', 'Inventory after competing sales');
    process.stdout.write('PASS concurrent native sales serialize; exactly one consumes the available stock\n');

    const promotionItem = {
      sku: `PROMO-${suffix}`, name: 'Native voucher acceptance item',
      salePriceVnd: 20000, costVnd: 8000, openingQuantity: '1',
    };
    const promotionProductImport = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import`,
      headers: { ...writeHeaders, 'idempotency-key': `native-promotion-import-${suffix}` },
      payload: { items: [promotionItem] },
    });
    requireStatus(promotionProductImport, 201, 'Voucher test product import');
    const promotionProductId = promotionProductImport.json().products[0].id;
    const promotionCode = `SAVE10-${suffix}`;
    const promotionCreated = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/promotions`, headers: writeHeaders,
      payload: {
        code: promotionCode, name: 'Native acceptance voucher', discountType: 'percent',
        discountPercent: '10', minimumSubtotalVnd: '10000', maximumDiscountVnd: '1000', usageLimit: 1,
      },
    });
    requireStatus(promotionCreated, 201, 'Native voucher creation');
    const promotionId = promotionCreated.json().promotion.id;
    const promotionPreview = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/promotions/preview`, headers: writeHeaders,
      payload: { code: promotionCode.toLowerCase(), subtotalVnd: '20000' },
    });
    requireStatus(promotionPreview, 200, 'Read-only voucher preview');
    assert.equal(promotionPreview.json().promotion.discountVnd, '1000');
    const promotionListBeforeSale = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/promotions`, headers });
    requireStatus(promotionListBeforeSale, 200, 'Voucher usage before sale');
    assert.equal(promotionListBeforeSale.json().promotions.find((row) => row.id === promotionId)?.usageCount, 0);
    const crossStorePromotions = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/promotions`, headers: secondHeaders });
    requireStatus(crossStorePromotions, 403, 'Cross-store voucher listing');

    const promotionSalePayload = {
      items: [{ productId: promotionProductId, quantity: 1 }], promotionCode,
      promotionDiscountVnd: '999999', tenders: [{ method: 'bank_transfer', amountReceivedVnd: '19000' }],
    };
    const promotionSaleHeaders = { ...writeHeaders, 'idempotency-key': `native-promotion-sale-${suffix}-01` };
    const promotionSale = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/sales`, headers: promotionSaleHeaders, payload: promotionSalePayload,
    });
    requireStatus(promotionSale, 201, 'Voucher sale');
    assert.equal(promotionSale.json().order.discountVnd, '1000', 'server recalculates discount instead of trusting the client');
    assert.equal(promotionSale.json().order.totalVnd, '19000');
    assert.equal(promotionSale.json().order.promotion.code, promotionCode);
    const promotionSaleReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/sales`, headers: promotionSaleHeaders, payload: promotionSalePayload,
    });
    requireStatus(promotionSaleReplay, 201, 'Voucher sale retry');
    assert.equal(promotionSaleReplay.headers['idempotent-replayed'], 'true');
    const promotionOrder = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/orders/${promotionSale.json().order.id}`, headers,
    });
    requireStatus(promotionOrder, 200, 'Voucher order history');
    assert.deepEqual(promotionOrder.json().order.promotion, { code: promotionCode, discountVnd: '1000' });
    const exhaustedPromotion = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/promotions/preview`, headers: writeHeaders,
      payload: { code: promotionCode, subtotalVnd: '20000' },
    });
    assert.equal(exhaustedPromotion.statusCode, 422, exhaustedPromotion.body);
    assert.equal(exhaustedPromotion.json().error.code, 'promotion_limit_reached');
    const promotionProductAfterSale = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products?q=${promotionItem.sku}`, headers });
    requireStatus(promotionProductAfterSale, 200, 'Voucher product inventory after replay');
    assertQuantity(promotionProductAfterSale.json().products[0]?.on_hand, '0.000', 'Voucher retry leaves inventory unchanged');
    process.stdout.write('PASS native voucher preview, exact discount, tenant denial, usage limit and idempotent redemption\n');

    const exportResponse = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/exports/products`, headers });
    requireStatus(exportResponse, 200, 'Server-side product CSV export');
    assert.match(exportResponse.headers['content-type'] || '', /text\/csv/i);
    assert.ok(exportResponse.body.startsWith('\uFEFF'), 'CSV uses a UTF-8 BOM for spreadsheet compatibility');
    process.stdout.write('PASS authorized product CSV export from native PostgreSQL\n');

    const supplierName = `Native supplier ${suffix}`;
    const supplierResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/suppliers`,
      headers: { ...writeHeaders, 'idempotency-key': `native-supplier-${suffix}-001` },
      payload: { name: supplierName, openingPayableVnd: '30000' },
    });
    requireStatus(supplierResult, 201, 'Supplier opening payable');
    const supplierId = supplierResult.json().supplier.id;
    assert.equal(supplierResult.json().supplier.balance_vnd, '30000');

    const purchaseItem = {
      sku: `NATIVE-PURCHASE-${suffix}`,
      name: 'Native purchase acceptance item',
      salePriceVnd: 15000,
      costVnd: 0,
      openingQuantity: '0',
    };
    const purchaseProductResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/import`,
      headers: { ...writeHeaders, 'idempotency-key': `native-purchase-product-${suffix}-001` },
      payload: { items: [purchaseItem] },
    });
    requireStatus(purchaseProductResult, 201, 'Purchase acceptance product');
    const purchaseProductId = purchaseProductResult.json().products[0]?.id;
    assert.ok(purchaseProductId, 'purchase acceptance product was created in the temporary store');

    const purchasePayload = {
      items: [{ productId: purchaseProductId, quantity: '2.5', unitCostVnd: '4000' }],
      amountPaidVnd: '4000',
      method: 'cash',
      supplierName,
      note: 'Native purchase and payable acceptance',
    };
    const purchaseHeaders = { ...writeHeaders, 'idempotency-key': `native-purchase-${suffix}-001` };
    const purchaseResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/purchases`, headers: purchaseHeaders, payload: purchasePayload,
    });
    requireStatus(purchaseResult, 201, 'Cash purchase receipt');
    const purchase = purchaseResult.json().purchase;
    assert.equal(purchase.totalVnd, '10000');
    assert.equal(purchase.paidVnd, '4000');
    const purchaseReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/purchases`, headers: purchaseHeaders, payload: purchasePayload,
    });
    requireStatus(purchaseReplay, 201, 'Idempotent purchase receipt retry');
    assert.equal(purchaseReplay.headers['idempotent-replayed'], 'true');
    assert.equal(purchaseReplay.json().purchase.id, purchase.id);

    const purchaseFinance = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(purchaseFinance, 200, 'Finance after purchase receipt');
    assert.equal(purchaseFinance.json().suppliers.find((row) => row.id === supplierId)?.balance_vnd, '36000');
    assert.equal(purchaseFinance.json().summary.supplierPayableVnd, '36000');
    assert.equal(purchaseFinance.json().purchases.find((row) => row.purchase_number === purchase.number)?.total_vnd, '10000');
    const purchaseCashMovement = purchaseFinance.json().movements.find((row) => row.source_type === 'purchase_payment'
      && row.source_id === purchase.id);
    assert.ok(purchaseCashMovement, 'cash purchase payment is present in the cashbook');
    assert.equal(purchaseCashMovement.amount_vnd, '4000');
    assert.equal(purchaseCashMovement.method, 'cash');
    assert.equal(purchaseCashMovement.cash_session_id, opened.json().session.id);
    const purchaseStock = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(purchaseStock, 200, 'Inventory after purchase receipt');
    assertQuantity(purchaseStock.json().products.find((row) => row.id === purchaseProductId)?.on_hand, '2.5', 'Purchased stock');
    assert.equal(purchaseStock.json().products.find((row) => row.id === purchaseProductId)?.cost_vnd, '4000');
    process.stdout.write('PASS native purchase receipt, stock/cost ledger, supplier opening payable and purchase replay\n');

    const shortCashPayment = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/suppliers/${supplierId}/payments`,
      headers: { ...writeHeaders, 'idempotency-key': `native-supplier-short-${suffix}-001` },
      payload: { amountVnd: '11001', method: 'cash', note: 'Expected to exceed drawer cash' },
    });
    requireStatus(shortCashPayment, 409, 'Supplier cash payment beyond drawer balance');
    assert.equal(shortCashPayment.json().error.code, 'cash_balance_insufficient');
    const financeAfterRejectedPayment = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeAfterRejectedPayment, 200, 'Finance after rejected supplier cash payment');
    assert.equal(financeAfterRejectedPayment.json().suppliers.find((row) => row.id === supplierId)?.balance_vnd, '36000');
    assert.equal(financeAfterRejectedPayment.json().movements.some((row) => row.note === 'Expected to exceed drawer cash'), false);
    const registerAfterPurchase = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/cash-register`, headers });
    requireStatus(registerAfterPurchase, 200, 'Cash register after purchase');
    assert.equal(registerAfterPurchase.json().session.expectedCashVnd, '11000');

    const settlementPayload = { amountVnd: '36000', method: 'bank_transfer', note: 'Settle acceptance supplier balance' };
    const settlementHeaders = { ...writeHeaders, 'idempotency-key': `native-supplier-settle-${suffix}-001` };
    const settlement = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/suppliers/${supplierId}/payments`,
      headers: settlementHeaders, payload: settlementPayload,
    });
    requireStatus(settlement, 201, 'Supplier bank-transfer settlement');
    const settlementReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/suppliers/${supplierId}/payments`,
      headers: settlementHeaders, payload: settlementPayload,
    });
    requireStatus(settlementReplay, 201, 'Idempotent supplier settlement retry');
    assert.equal(settlementReplay.headers['idempotent-replayed'], 'true');
    assert.equal(settlementReplay.json().payment.id, settlement.json().payment.id);
    const financeAfterSettlement = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeAfterSettlement, 200, 'Finance after supplier settlement');
    assert.equal(financeAfterSettlement.json().suppliers.find((row) => row.id === supplierId)?.balance_vnd, '0');
    assert.equal(financeAfterSettlement.json().summary.supplierPayableVnd, '0');
    assert.ok(financeAfterSettlement.json().movements.some((row) => row.source_id === settlement.json().payment.id
      && row.source_type === 'supplier_payment' && row.method === 'bank_transfer' && row.cash_session_id === null));

    const customerResult = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/customers`,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-${suffix}-001` },
      payload: { name: `Native debtor ${suffix}`, phone: '0900000011', openingBalanceVnd: '3000' },
    });
    requireStatus(customerResult, 201, 'Customer opening receivable');
    const customerId = customerResult.json().customer.id;
    const creditSalePayload = {
      customerId,
      items: [{ productId: purchaseProductId, quantity: 1 }],
      tenders: [{ method: 'bank_transfer', amountReceivedVnd: '5000' }],
    };
    const creditSale = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/sales`,
      headers: { ...writeHeaders, 'idempotency-key': `native-credit-sale-${suffix}-001` }, payload: creditSalePayload,
    });
    requireStatus(creditSale, 201, 'Partially paid customer sale');
    assert.equal(creditSale.json().order.totalVnd, '15000');
    assert.equal(creditSale.json().order.dueVnd, '10000');
    const customerPaymentPayload = { amountVnd: '11000', method: 'bank_transfer', note: 'Native customer balance settlement' };
    const customerPaymentHeaders = { ...writeHeaders, 'idempotency-key': `native-customer-payment-${suffix}-001` };
    const customerPaymentUrl = `/api/stores/${store.id}/customers/${customerId}/payments`;
    const customerPayment = await app.inject({
      method: 'POST', url: customerPaymentUrl, headers: customerPaymentHeaders, payload: customerPaymentPayload,
    });
    requireStatus(customerPayment, 201, 'Customer account settlement');
    assert.equal(customerPayment.json().payment.customerBalanceVnd, '2000');
    assert.equal(customerPayment.json().payment.allocations.length, 1);
    assert.equal(customerPayment.json().payment.allocations[0].orderId, creditSale.json().order.id);
    assert.equal(customerPayment.json().payment.allocations[0].amountVnd, '10000');
    const customerDetailAfterReceipt = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/customers/${customerId}`, headers,
    });
    requireStatus(customerDetailAfterReceipt, 200, 'Customer profile payment history');
    assert.equal(customerDetailAfterReceipt.json().recentPayments.length, 1);
    assert.equal(customerDetailAfterReceipt.json().recentPayments[0].id, customerPayment.json().payment.id);
    assert.equal(customerDetailAfterReceipt.json().recentPayments[0].amount_vnd, '11000');
    assert.equal(customerDetailAfterReceipt.json().recentPayments[0].allocations[0].amountVnd, '10000');
    assert.equal(customerDetailAfterReceipt.json().recentPayments[0].opening_balance_amount_vnd, '1000');
    const customerPaymentReplay = await app.inject({
      method: 'POST', url: customerPaymentUrl, headers: customerPaymentHeaders, payload: customerPaymentPayload,
    });
    requireStatus(customerPaymentReplay, 201, 'Customer account settlement retry');
    assert.equal(customerPaymentReplay.headers['idempotent-replayed'], 'true');
    assert.equal(customerPaymentReplay.json().payment.id, customerPayment.json().payment.id);
    const excessCustomerPayment = await app.inject({
      method: 'POST', url: customerPaymentUrl,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-overpay-${suffix}-01` },
      payload: { amountVnd: '2001', method: 'bank_transfer', note: 'Expected to exceed receivable' },
    });
    requireStatus(excessCustomerPayment, 409, 'Customer receivable overpayment rejection');
    assert.equal(excessCustomerPayment.json().error.code, 'payment_exceeds_due');
    const competingCustomerPayments = await Promise.all([
      app.inject({
        method: 'POST', url: customerPaymentUrl,
        headers: { ...writeHeaders, 'idempotency-key': `native-customer-race-${suffix}-a` },
        payload: { amountVnd: '1500', method: 'bank_transfer', note: 'Native competing receipt A' },
      }),
      app.inject({
        method: 'POST', url: customerPaymentUrl,
        headers: { ...writeHeaders, 'idempotency-key': `native-customer-race-${suffix}-b` },
        payload: { amountVnd: '1500', method: 'bank_transfer', note: 'Native competing receipt B' },
      }),
    ]);
    assert.deepEqual(competingCustomerPayments.map((response) => response.statusCode).sort(), [201, 409]);
    assert.equal(competingCustomerPayments.find((response) => response.statusCode === 409).json().error.code, 'payment_exceeds_due');
    const finalCustomerPayment = await app.inject({
      method: 'POST', url: customerPaymentUrl,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-final-${suffix}-01` },
      payload: { amountVnd: '500', method: 'bank_transfer', note: 'Native final receivable settlement' },
    });
    requireStatus(finalCustomerPayment, 201, 'Final opening-balance settlement');
    assert.equal(finalCustomerPayment.json().payment.customerBalanceVnd, '0');
    const financeAfterCustomerPayment = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeAfterCustomerPayment, 200, 'Finance after customer settlement');
    assert.equal(financeAfterCustomerPayment.json().summary.customerDebtVnd, '0');
    assert.ok(financeAfterCustomerPayment.json().movements.some((row) => row.source_type === 'customer_payment'
      && row.source_id === customerPayment.json().payment.id && row.amount_vnd === '11000'
      && row.method === 'bank_transfer' && row.cash_session_id === null));
    process.stdout.write('PASS native customer receivable allocation, durable payment history, opening debt, replay and overpayment rejection\n');

    const inventoryBeforeCount = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/inventory`, headers });
    requireStatus(inventoryBeforeCount, 200, 'Inventory before native count');
    const countProduct = inventoryBeforeCount.json().products.find((row) => row.id === purchaseProductId);
    assert.ok(countProduct?.inventory_version, 'counted product has a current inventory version');
    const countPayload = {
      items: [{
        productId: purchaseProductId,
        expectedInventoryVersion: Number(countProduct.inventory_version),
        count: '1.25',
        sourceLine: 2,
      }],
    };
    const countPreview = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/stock-adjustments/bulk/preview`, headers: writeHeaders, payload: countPayload,
    });
    requireStatus(countPreview, 200, 'Native bulk-count preview');
    assert.equal(countPreview.json().valid, true);
    assert.equal(countPreview.json().changedCount, 1);
    assert.equal(countPreview.json().items[0].onHand, '1.500');
    const inventoryAfterPreview = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/inventory`, headers });
    requireStatus(inventoryAfterPreview, 200, 'Inventory after count preview');
    const productAfterPreview = inventoryAfterPreview.json().products.find((row) => row.id === purchaseProductId);
    assert.equal(productAfterPreview.on_hand, countProduct.on_hand, 'count preview must not change stock');
    assert.equal(productAfterPreview.inventory_version, countProduct.inventory_version, 'count preview must not change the stock version');

    const countHeaders = { ...writeHeaders, 'idempotency-key': `native-bulk-count-${suffix}-001` };
    const counted = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/stock-adjustments/bulk`, headers: countHeaders,
      payload: { ...countPayload, reason: 'Nghiệm thu kiểm kê native' },
    });
    requireStatus(counted, 200, 'Native bulk-count commit');
    assert.equal(counted.json().changedCount, 1);
    assert.equal(counted.json().changed[0].onHand, '1.25');
    const countReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/stock-adjustments/bulk`, headers: countHeaders,
      payload: { ...countPayload, reason: 'Nghiệm thu kiểm kê native' },
    });
    requireStatus(countReplay, 200, 'Native bulk-count idempotent retry');
    assert.equal(countReplay.headers['idempotent-replayed'], 'true');
    assert.deepEqual(countReplay.json(), counted.json());
    const inventoryAfterCount = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/inventory`, headers });
    requireStatus(inventoryAfterCount, 200, 'Inventory after native count');
    const countedProduct = inventoryAfterCount.json().products.find((row) => row.id === purchaseProductId);
    assertQuantity(countedProduct.on_hand, '1.25', 'Native bulk-count stock');
    assert.equal(countedProduct.latest_movement_type, 'count');
    const countMovementCsv = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/exports/inventory-movements`, headers,
    });
    requireStatus(countMovementCsv, 200, 'Native bulk-count movement CSV');
    assert.ok(countMovementCsv.body.includes('Nghiệm thu kiểm kê native'));
    process.stdout.write('PASS native bulk-count preview, no-write assertion, atomic count, ledger export and replay\n');

    const catalogBeforeBulkUpdate = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(catalogBeforeBulkUpdate, 200, 'Catalog before native bulk update');
    const bulkUpdateProduct = catalogBeforeBulkUpdate.json().products.find((row) => row.id === purchaseProductId);
    assert.ok(bulkUpdateProduct?.version, 'bulk-updated product has a current catalog version');
    const bulkUpdateItems = [{
      productId: purchaseProductId,
      version: Number(bulkUpdateProduct.version),
      sourceLine: 2,
      name: 'Native bulk update acceptance item',
      salePriceVnd: 17000,
    }];
    const bulkUpdatePreview = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/bulk-update/preview`, headers: writeHeaders,
      payload: { items: bulkUpdateItems },
    });
    requireStatus(bulkUpdatePreview, 200, 'Native product bulk-update preview');
    assert.equal(bulkUpdatePreview.json().valid, true);
    assert.equal(bulkUpdatePreview.json().changedCount, 1);
    const catalogAfterBulkUpdatePreview = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(catalogAfterBulkUpdatePreview, 200, 'Catalog after bulk-update preview');
    const unchangedBulkUpdateProduct = catalogAfterBulkUpdatePreview.json().products.find((row) => row.id === purchaseProductId);
    assert.equal(unchangedBulkUpdateProduct.name, bulkUpdateProduct.name, 'bulk-update preview must not change product data');
    assert.equal(unchangedBulkUpdateProduct.version, bulkUpdateProduct.version, 'bulk-update preview must not change catalog version');

    const bulkUpdateHeaders = { ...writeHeaders, 'idempotency-key': `native-product-bulk-update-${suffix}-001` };
    const bulkUpdated = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/bulk-update`, headers: bulkUpdateHeaders,
      payload: { items: bulkUpdateItems },
    });
    requireStatus(bulkUpdated, 200, 'Native product bulk update');
    assert.equal(bulkUpdated.json().changedCount, 1);
    const bulkUpdateReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/products/bulk-update`, headers: bulkUpdateHeaders,
      payload: { items: bulkUpdateItems },
    });
    requireStatus(bulkUpdateReplay, 200, 'Native product bulk-update retry');
    assert.equal(bulkUpdateReplay.headers['idempotent-replayed'], 'true');
    assert.deepEqual(bulkUpdateReplay.json(), bulkUpdated.json());
    const catalogAfterBulkUpdate = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/products`, headers });
    requireStatus(catalogAfterBulkUpdate, 200, 'Catalog after native bulk update');
    const updatedBulkProduct = catalogAfterBulkUpdate.json().products.find((row) => row.id === purchaseProductId);
    assert.equal(updatedBulkProduct.name, 'Native bulk update acceptance item');
    assert.equal(updatedBulkProduct.sale_price_vnd, '17000');
    assert.equal(updatedBulkProduct.version, bulkUpdateProduct.version + 1);
    const bulkPriceHistory = await app.inject({
      method: 'GET', url: `/api/stores/${store.id}/products/${purchaseProductId}/price-history`, headers,
    });
    requireStatus(bulkPriceHistory, 200, 'Native product bulk-updated sale-price history');
    assert.equal(bulkPriceHistory.json().history[0].source_type, 'bulk_update');
    assert.equal(bulkPriceHistory.json().history[0].previous_price_vnd, '15000');
    assert.equal(bulkPriceHistory.json().history[0].new_price_vnd, '17000');
    assert.equal(bulkPriceHistory.json().history[0].source_id, bulkUpdated.json().bulkUpdateId);
    assert.equal(bulkPriceHistory.json().history.length, 2, 'bulk-update replay must not duplicate price history');
    const inventoryAfterBulkUpdate = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/inventory`, headers });
    requireStatus(inventoryAfterBulkUpdate, 200, 'Inventory after native product bulk update');
    const inventoryAfterBulkUpdateProduct = inventoryAfterBulkUpdate.json().products.find((row) => row.id === purchaseProductId);
    assert.equal(inventoryAfterBulkUpdateProduct.on_hand, countedProduct.on_hand, 'catalog update must not change stock');
    assert.equal(inventoryAfterBulkUpdateProduct.inventory_version, countedProduct.inventory_version, 'catalog update must not change stock version');
    process.stdout.write('PASS native product bulk-update and append-only sale-price history with replay protection\n');

    const closePayload = { countedCashVnd: '10999', note: 'One VND short at close' };
    const closeHeaders = { ...writeHeaders, 'idempotency-key': `native-cash-close-${suffix}-001` };
    const rejectedClose = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/cash-register/${opened.json().session.id}/close`,
      headers: { ...writeHeaders, 'idempotency-key': `native-cash-close-missing-reason-${suffix}` },
      payload: { countedCashVnd: '10999', note: '' },
    });
    requireStatus(rejectedClose, 400, 'Cash variance requires a reason');
    assert.equal(rejectedClose.json().error.code, 'cash_variance_reason_required');
    const acceptedClose = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/cash-register/${opened.json().session.id}/close`,
      headers: closeHeaders, payload: closePayload,
    });
    requireStatus(acceptedClose, 201, 'Cash-session reconciliation');
    assert.equal(acceptedClose.json().session.expectedCashVnd, '11000');
    assert.equal(acceptedClose.json().session.countedCashVnd, '10999');
    assert.equal(acceptedClose.json().session.varianceVnd, '-1');
    const closeReplay = await app.inject({
      method: 'POST', url: `/api/stores/${store.id}/cash-register/${opened.json().session.id}/close`,
      headers: closeHeaders, payload: closePayload,
    });
    requireStatus(closeReplay, 201, 'Idempotent cash-session close retry');
    assert.equal(closeReplay.headers['idempotent-replayed'], 'true');
    const closedRegister = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/cash-register`, headers });
    requireStatus(closedRegister, 200, 'Cash register after close');
    assert.equal(closedRegister.json().session, null);
    assert.equal(closedRegister.json().lastClosed.expectedCashVnd, '11000');
    assert.equal(closedRegister.json().lastClosed.countedCashVnd, '10999');
    assert.equal(closedRegister.json().lastClosed.varianceVnd, '-1');
    const financeAfterClose = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeAfterClose, 200, 'Finance after cash-session reconciliation');
    const reconciliation = financeAfterClose.json().movements.find((row) => row.source_type === 'cash_session_reconciliation'
      && row.source_id === opened.json().session.id);
    assert.ok(reconciliation, 'cash variance is recorded as a reconciliation movement');
    assert.equal(reconciliation.amount_vnd, '1');
    assert.equal(reconciliation.direction, 'out');
    process.stdout.write('PASS supplier settlement, cash shortage rollback, variance reason, reconciliation and close replay\n');

    const customerPhoneSuffix = (BigInt(`0x${suffix}`) % 100_000_000n).toString().padStart(8, '0');
    const customerImportItems = [
      { sourceLine: 2, name: `Native imported customer ${suffix}`, phone: `090${customerPhoneSuffix}`, email: `imported-${suffix}@slink.invalid`, openingBalanceVnd: '1250', note: 'Native CSV acceptance' },
      { sourceLine: 3, name: `Native imported customer second ${suffix}`, phone: `091${customerPhoneSuffix}`, email: `imported-second-${suffix}@slink.invalid`, openingBalanceVnd: '0', note: '' },
    ];
    assert.ok(customerImportItems.every((row) => /^\d{7,15}$/.test(row.phone)), 'native customer CSV fixtures must use valid digit-only phone numbers');
    assert.equal(new Set(customerImportItems.map((row) => row.phone)).size, customerImportItems.length, 'native customer CSV fixtures must use distinct phone numbers');
    const customersUrl = `/api/stores/${store.id}/customers`;
    const customersBeforePreview = await app.inject({ method: 'GET', url: customersUrl, headers });
    requireStatus(customersBeforePreview, 200, 'Customers before CSV preview');
    const financeBeforeCustomerPreview = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeBeforeCustomerPreview, 200, 'Finance before customer CSV preview');
    const movementIdsBeforeCustomerImport = financeBeforeCustomerPreview.json().movements.map((row) => row.id).sort();
    const customerImportPreview = await app.inject({
      method: 'POST', url: `${customersUrl}/import/preview`, headers: writeHeaders, payload: { items: customerImportItems },
    });
    requireStatus(customerImportPreview, 200, 'Customer CSV import preview');
    assert.equal(customerImportPreview.json().valid, true);
    assert.equal(customerImportPreview.json().count, 2);
    assert.equal(customerImportPreview.json().openingBalanceTotalVnd, '1250');
    const customersAfterPreview = await app.inject({ method: 'GET', url: customersUrl, headers });
    requireStatus(customersAfterPreview, 200, 'Customers after CSV preview');
    assert.equal(customersAfterPreview.json().total, customersBeforePreview.json().total, 'customer import preview must not create records');
    const financeAfterCustomerPreview = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(financeAfterCustomerPreview, 200, 'Finance after customer CSV preview');
    assert.equal(financeAfterCustomerPreview.json().summary.customerDebtVnd, financeBeforeCustomerPreview.json().summary.customerDebtVnd, 'customer import preview must not change receivables');
    assert.deepEqual(financeAfterCustomerPreview.json().movements.map((row) => row.id).sort(), movementIdsBeforeCustomerImport, 'customer import preview must not create cash movements');
    const customerImportHeaders = { ...writeHeaders, 'idempotency-key': `native-customer-import-${suffix}-001` };
    const customerImport = await app.inject({
      method: 'POST', url: `${customersUrl}/import`, headers: customerImportHeaders, payload: { items: customerImportItems },
    });
    requireStatus(customerImport, 201, 'Customer CSV import');
    assert.equal(customerImport.json().count, 2);
    assert.equal(customerImport.json().openingBalanceTotalVnd, '1250');
    const customerImportReplay = await app.inject({
      method: 'POST', url: `${customersUrl}/import`, headers: customerImportHeaders, payload: { items: customerImportItems },
    });
    requireStatus(customerImportReplay, 201, 'Customer CSV import retry');
    assert.equal(customerImportReplay.headers['idempotent-replayed'], 'true');
    assert.equal(customerImportReplay.json().importId, customerImport.json().importId);
    const importedCustomerList = await app.inject({ method: 'GET', url: customersUrl, headers });
    requireStatus(importedCustomerList, 200, 'Customer list after CSV import');
    assert.equal(importedCustomerList.json().total, customersBeforePreview.json().total + 2);
    assert.equal(importedCustomerList.json().customers.find((row) => row.email === `imported-${suffix}@slink.invalid`).balance_vnd, '1250');
    const importedCustomerFinance = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/finance`, headers });
    requireStatus(importedCustomerFinance, 200, 'Finance after customer CSV import');
    assert.equal(importedCustomerFinance.json().summary.customerDebtVnd, '1250');
    assert.deepEqual(
      importedCustomerFinance.json().movements.map((row) => row.id).sort(),
      movementIdsBeforeCustomerImport,
      'opening receivables must not add cash movements',
    );
    process.stdout.write('PASS native customer CSV preview, no-write assertion, opening receivable, commit and replay\n');

    const importedCustomer = importedCustomerList.json().customers.find((row) => row.email === `imported-${suffix}@slink.invalid`);
    assert.ok(importedCustomer?.id, 'customer CSV import returns a durable customer ID');
    const importedCustomerUrl = `${customersUrl}/${importedCustomer.id}`;
    const neverPurchasedCustomers = await app.inject({ method: 'GET', url: `${customersUrl}?segment=no_purchase`, headers });
    requireStatus(neverPurchasedCustomers, 200, 'Native never-purchased customer segment');
    assert.ok(neverPurchasedCustomers.json().customers.some((row) => row.id === importedCustomer.id));
    assert.ok(neverPurchasedCustomers.json().customers.every((row) => row.order_count === 0));
    const owingCustomers = await app.inject({ method: 'GET', url: `${customersUrl}?segment=owing`, headers });
    requireStatus(owingCustomers, 200, 'Native customers with receivables segment');
    assert.ok(owingCustomers.json().customers.some((row) => row.id === importedCustomer.id && row.balance_vnd === '1250'));
    const spendingCustomers = await app.inject({ method: 'GET', url: `${customersUrl}?minSpentVnd=1`, headers });
    requireStatus(spendingCustomers, 200, 'Native minimum customer spend filter');
    assert.ok(spendingCustomers.json().customers.some((row) => row.id === customerId && BigInt(row.total_spent_vnd) >= 1n));
    const invalidCustomerSegment = await app.inject({ method: 'GET', url: `${customersUrl}?segment=vip`, headers });
    requireStatus(invalidCustomerSegment, 400, 'Native invalid customer segment rejection');
    process.stdout.write('PASS native CRM no-purchase/owing segments, minimum-spend filter and invalid-filter rejection\n');
    const customerTagUrl = `${importedCustomerUrl}/tags`;
    const customerTagPayload = { operation: 'add', tag: '  Khách   VIP  ' };
    const customerTagHeaders = { ...writeHeaders, 'idempotency-key': `native-customer-tag-${suffix}-001` };
    const customerTagAdd = await app.inject({
      method: 'POST', url: customerTagUrl, headers: customerTagHeaders, payload: customerTagPayload,
    });
    requireStatus(customerTagAdd, 200, 'Native customer tag add');
    assert.equal(customerTagAdd.json().changed, true);
    assert.deepEqual(customerTagAdd.json().tags.map((tag) => tag.label), ['Khách VIP']);
    const customerTagReplay = await app.inject({
      method: 'POST', url: customerTagUrl, headers: customerTagHeaders, payload: customerTagPayload,
    });
    requireStatus(customerTagReplay, 200, 'Native customer tag retry');
    assert.equal(customerTagReplay.headers['idempotent-replayed'], 'true');
    assert.deepEqual(customerTagReplay.json().tags.map((tag) => tag.label), ['Khách VIP']);
    const taggedCustomerList = await app.inject({
      method: 'GET', url: `${customersUrl}?tag=${encodeURIComponent('KHÁCH VIP')}`, headers,
    });
    requireStatus(taggedCustomerList, 200, 'Native customer tag filter');
    assert.equal(taggedCustomerList.json().total, 1);
    assert.equal(taggedCustomerList.json().customers[0].id, importedCustomer.id);
    const taggedCustomerCsv = await app.inject({ method: 'GET', url: `/api/stores/${store.id}/exports/customers`, headers });
    requireStatus(taggedCustomerCsv, 200, 'Native customer CSV tag export');
    assert.ok(taggedCustomerCsv.body.includes('"Khách VIP"'));
    const customerSegmentsUrl = `/api/stores/${store.id}/customer-segments`;
    const customerSegmentPayload = { name: 'Khách gắn nhãn VIP', criteria: { tag: 'Khách VIP', minSpentVnd: '0' } };
    const customerSegmentHeaders = { ...writeHeaders, 'idempotency-key': `native-customer-segment-${suffix}-001` };
    const customerSegmentCreated = await app.inject({
      method: 'POST', url: customerSegmentsUrl, headers: customerSegmentHeaders, payload: customerSegmentPayload,
    });
    requireStatus(customerSegmentCreated, 201, 'Native saved customer segment create');
    const customerSegment = customerSegmentCreated.json().segment;
    const customerSegmentReplay = await app.inject({
      method: 'POST', url: customerSegmentsUrl, headers: customerSegmentHeaders, payload: customerSegmentPayload,
    });
    requireStatus(customerSegmentReplay, 201, 'Native saved customer segment retry');
    assert.equal(customerSegmentReplay.headers['idempotent-replayed'], 'true');
    assert.equal(customerSegmentReplay.json().segment.id, customerSegment.id);
    const customerSegmentList = await app.inject({ method: 'GET', url: customerSegmentsUrl, headers });
    requireStatus(customerSegmentList, 200, 'Native saved customer segment list');
    assert.deepEqual(customerSegmentList.json().segments.map((segment) => segment.id), [customerSegment.id]);
    const savedSegmentFilter = await app.inject({
      method: 'GET', url: `${customersUrl}?tag=${encodeURIComponent(customerSegment.criteria.tag)}&minSpentVnd=${customerSegment.criteria.minSpentVnd}`, headers,
    });
    requireStatus(savedSegmentFilter, 200, 'Native saved customer segment filter application');
    assert.ok(savedSegmentFilter.json().customers.some((row) => row.id === importedCustomer.id));
    const customerSegmentUpdatePayload = {
      name: 'Khách gắn nhãn VIP đã cập nhật', criteria: { segment: 'no_purchase', tag: 'Khách VIP', minSpentVnd: '0' }, version: customerSegment.version,
    };
    const customerSegmentUpdated = await app.inject({
      method: 'PUT', url: `${customerSegmentsUrl}/${customerSegment.id}`,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-segment-update-${suffix}` }, payload: customerSegmentUpdatePayload,
    });
    requireStatus(customerSegmentUpdated, 200, 'Native saved customer segment update');
    assert.equal(customerSegmentUpdated.json().segment.version, 2);
    const customerSegmentDeleted = await app.inject({
      method: 'POST', url: `${customerSegmentsUrl}/${customerSegment.id}/delete`,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-segment-delete-${suffix}` }, payload: { version: 2 },
    });
    requireStatus(customerSegmentDeleted, 200, 'Native saved customer segment delete');
    const customerSegmentAfterDelete = await app.inject({ method: 'GET', url: customerSegmentsUrl, headers });
    requireStatus(customerSegmentAfterDelete, 200, 'Native saved customer segment list after delete');
    assert.deepEqual(customerSegmentAfterDelete.json().segments, []);
    process.stdout.write('PASS native saved customer segments, replay, filter application, versioned update and delete\n');
    const customerTagRemove = await app.inject({
      method: 'POST', url: customerTagUrl,
      headers: { ...writeHeaders, 'idempotency-key': `native-customer-tag-remove-${suffix}-001` },
      payload: { operation: 'remove', tag: 'KHÁCH VIP' },
    });
    requireStatus(customerTagRemove, 200, 'Native customer tag removal');
    assert.deepEqual(customerTagRemove.json().tags, []);
    const untaggedCustomerList = await app.inject({
      method: 'GET', url: `${customersUrl}?tag=${encodeURIComponent('Khách VIP')}`, headers,
    });
    requireStatus(untaggedCustomerList, 200, 'Native customer tag filter after removal');
    assert.equal(untaggedCustomerList.json().total, 0);
    process.stdout.write('PASS native CRM tags, idempotent add, filtered customer list, CSV export and removal\n');
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  process.stderr.write(`Native PostgreSQL acceptance failed: ${error.message}\n`);
  process.exitCode = 1;
});
