'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']];
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

async function testApp(t) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'));
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    REVOKE ALL ON public.product_sale_price_history FROM slink_app;
    GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({ pool, logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  app.testDb = db;
  t.after(() => app.close());
  return app;
}

async function registerOwner(app, suffix) {
  const email = `variant-owner-${suffix}@example.com`;
  const password = 'correct horse battery staple 47';
  const registration = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin }, payload: { email, displayName: 'Chủ cửa hàng', storeName: `Cửa hàng ${suffix}`, password } });
  assert.equal(registration.statusCode, 201, registration.body);
  const token = new URLSearchParams(new URL(registration.json().developmentVerificationUrl).hash.slice(1)).get('token');
  const verified = await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token } });
  assert.equal(verified.statusCode, 200, verified.body);
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  assert.equal(login.statusCode, 200, login.body);
  const cookies = cookiesFrom(login);
  return {
    store: login.json().stores[0],
    headers: { cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '), origin, 'x-csrf-token': cookies.slink_csrf },
  };
}

function groupPayload(suffix) {
  return {
    name: 'Áo thun cotton', category: 'Thời trang', unit: 'cái',
    variants: [
      { sku: `TS-RED-M-${suffix}`, barcode: null, attributes: [{ name: 'Màu', value: 'Đỏ' }, { name: 'Cỡ', value: 'M' }], salePriceVnd: 129000, costVnd: 70000, lowStockThreshold: 2, inventoryTracked: true },
      { sku: `TS-BLUE-L-${suffix}`, barcode: `893000000${suffix.padStart(4, '0')}`, attributes: [{ name: 'Màu', value: 'Xanh' }, { name: 'Cỡ', value: 'L' }], salePriceVnd: 139000, costVnd: 75000, lowStockThreshold: 2, inventoryTracked: true },
    ],
  };
}

test('variant groups create separate sellable SKUs atomically and replay safely', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'group');
  const url = `/api/stores/${owner.store.id}/products/variants`;
  const payload = groupPayload('001');
  const headers = { ...owner.headers, 'idempotency-key': 'variant-group-create-0001' };
  const created = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().count, 2);
  assert.equal(new Set(created.json().products.map((row) => row.variant_group_id)).size, 1);
  assert.equal(created.json().products[0].variant_group_name, payload.name);
  assert.deepEqual(created.json().products[0].variant_attributes, { 'Cỡ': 'M', 'Màu': 'Đỏ' });
  assert.match(created.json().products[0].name, /Áo thun cotton/);
  assert.match(created.json().products[0].name, /Đỏ/);

  const replay = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.deepEqual(replay.json().products.map((row) => row.id), created.json().products.map((row) => row.id));

  const saved = await app.testDb.query(
    `SELECT count(*)::int AS products,
            (SELECT count(*)::int FROM product_sale_price_history h WHERE h.store_id = $1) AS prices,
            (SELECT count(*)::int FROM product_cost_history h WHERE h.store_id = $1) AS costs,
            (SELECT count(*)::int FROM inventory_balances b WHERE b.store_id = $1) AS balances,
            (SELECT count(*)::int FROM audit_events a WHERE a.store_id = $1 AND a.action = 'product.variant_group_created') AS groups
     FROM products WHERE store_id = $1`, [owner.store.id]
  );
  assert.equal(saved.rows[0].products, 2);
  assert.equal(saved.rows[0].prices, 2);
  assert.equal(saved.rows[0].costs, 2);
  assert.equal(saved.rows[0].balances, 2);
  assert.equal(saved.rows[0].groups, 1);

  const conflict = await app.inject({ method: 'POST', url, headers: { ...owner.headers, 'idempotency-key': 'variant-group-conflict-0001' }, payload: payload });
  assert.equal(conflict.statusCode, 409, conflict.body);
  const afterConflict = await app.testDb.query('SELECT count(*)::int AS count FROM products WHERE store_id = $1', [owner.store.id]);
  assert.equal(afterConflict.rows[0].count, 2);

  const other = await registerOwner(app, 'other');
  const crossStore = await app.inject({ method: 'POST', url: `/api/stores/${other.store.id}/products/variants`, headers: { ...owner.headers, 'idempotency-key': 'variant-group-cross-store-0001' }, payload: groupPayload('002') });
  assert.equal(crossStore.statusCode, 403, crossStore.body);
});

test('variant-group creation rolls back every row when audit history cannot be written', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'rollback');
  await app.testDb.exec(`
    CREATE FUNCTION fail_variant_group_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'product.variant_created' THEN RAISE EXCEPTION 'injected variant audit failure'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_variant_group_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_variant_group_audit();
  `);
  const response = await app.inject({
    method: 'POST', url: `/api/stores/${owner.store.id}/products/variants`,
    headers: { ...owner.headers, 'idempotency-key': 'variant-group-rollback-0001' }, payload: groupPayload('003'),
  });
  assert.equal(response.statusCode, 500, response.body);
  const remaining = await app.testDb.query(
    `SELECT count(*)::int AS products,
            (SELECT count(*)::int FROM idempotency_records WHERE store_id = $1 AND idempotency_key = 'variant-group-rollback-0001') AS idempotency
     FROM products WHERE store_id = $1`, [owner.store.id]
  );
  assert.equal(remaining.rows[0].products, 0);
  assert.equal(remaining.rows[0].idempotency, 0);
});

test('existing groups accept new SKUs, safe replay, attribute correction and duplicate protection', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'maintain');
  const created = await app.inject({
    method: 'POST', url: `/api/stores/${owner.store.id}/products/variants`,
    headers: { ...owner.headers, 'idempotency-key': 'variant-maintain-create-0001' }, payload: groupPayload('101'),
  });
  assert.equal(created.statusCode, 201, created.body);
  const anchor = created.json().products[0];
  const url = `/api/stores/${owner.store.id}/products/${anchor.id}/variants`;
  const payload = { variants: [{
    sku: 'TS-GREEN-M-101', barcode: null,
    attributes: [{ name: 'Màu', value: 'Xanh lá' }, { name: 'Cỡ', value: 'M' }],
    salePriceVnd: 135000, costVnd: 73000, lowStockThreshold: 2, inventoryTracked: true,
  }] };
  const headers = { ...owner.headers, 'idempotency-key': 'variant-maintain-add-0001' };
  const added = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(added.json().count, 1);
  assert.equal(added.json().products[0].variant_group_id, anchor.variant_group_id);
  assert.equal(added.json().products[0].on_hand, '0');
  const replay = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  assert.equal(replay.json().products[0].id, added.json().products[0].id);

  const duplicate = await app.inject({
    method: 'POST', url, headers: { ...owner.headers, 'idempotency-key': 'variant-maintain-dup-0001' },
    payload: { variants: [{ ...payload.variants[0], sku: 'TS-GREEN-M-OTHER', attributes: [{ name: 'Cỡ', value: 'm' }, { name: 'Màu', value: 'XANH LÁ' }] }] },
  });
  assert.equal(duplicate.statusCode, 409, duplicate.body);

  const changed = await app.inject({
    method: 'PUT', url: `/api/stores/${owner.store.id}/products/${anchor.id}`,
    headers: owner.headers,
    payload: { version: anchor.version, variantAttributes: { 'Cỡ': 'M', 'Màu': 'Vàng' } },
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.deepEqual(changed.json().product.variant_attributes, { 'Cỡ': 'M', 'Màu': 'Vàng' });
  assert.match(changed.json().product.name, /Vàng/);
  const duplicateEdit = await app.inject({
    method: 'PUT', url: `/api/stores/${owner.store.id}/products/${anchor.id}`,
    headers: owner.headers,
    payload: { version: changed.json().product.version, variantAttributes: { 'Cỡ': 'L', 'Màu': 'Xanh' } },
  });
  assert.equal(duplicateEdit.statusCode, 409, duplicateEdit.body);
  assert.equal(duplicateEdit.json().error.code, 'duplicate_variant_attributes');
  const saved = await app.testDb.query(
    `SELECT p.variant_attributes, p.version,
            (SELECT count(*)::int FROM inventory_balances b WHERE b.store_id = p.store_id AND b.product_id = p.id AND b.on_hand <> 0) AS nonzero_balances,
            (SELECT count(*)::int FROM audit_events a WHERE a.entity_id = p.id AND a.action = 'product.variant_attributes_updated') AS attribute_audits
     FROM products p WHERE p.store_id = $1 AND p.id = $2`, [owner.store.id, anchor.id]
  );
  assert.deepEqual(saved.rows[0].variant_attributes, { 'Cỡ': 'M', 'Màu': 'Vàng' });
  assert.equal(saved.rows[0].nonzero_balances, 0);
  assert.equal(saved.rows[0].attribute_audits, 1);
});

test('product CSV preview and import create variant groups with opening stock atomically', async (t) => {
  const app = await testApp(t);
  const owner = await registerOwner(app, 'csv-group');
  const warehouse = await app.testDb.query('SELECT id FROM warehouses WHERE store_id = $1 AND status = \'active\' LIMIT 1', [owner.store.id]);
  const items = [
    { sku: 'CSV-RED-M', barcode: null, name: 'Áo CSV', category: 'Thời trang', unit: 'cái', salePriceVnd: 100000, costVnd: 50000, lowStockThreshold: 2, inventoryTracked: true, openingQuantity: '2', sourceLine: 2, variantGroupName: 'Áo CSV', variantAttributes: { Màu: 'Đỏ', Cỡ: 'M' } },
    { sku: 'CSV-BLUE-M', barcode: null, name: 'Áo CSV', category: 'Thời trang', unit: 'cái', salePriceVnd: 105000, costVnd: 52000, lowStockThreshold: 2, inventoryTracked: true, openingQuantity: '1', sourceLine: 3, variantGroupName: 'Áo CSV', variantAttributes: { Màu: 'Xanh', Cỡ: 'M' } },
  ];
  const url = `/api/stores/${owner.store.id}/products/import`;
  const preview = await app.inject({ method: 'POST', url: `${url}/preview`, headers: owner.headers, payload: { items, warehouseId: warehouse.rows[0].id } });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().valid, true);
  assert.equal(preview.json().variantGroupCount, 1);
  const before = await app.testDb.query('SELECT count(*)::int AS count FROM products WHERE store_id = $1', [owner.store.id]);
  assert.equal(before.rows[0].count, 0);
  const payload = { items, warehouseId: warehouse.rows[0].id };
  const headers = { ...owner.headers, 'idempotency-key': 'variant-csv-import-0001' };
  const imported = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(imported.statusCode, 201, imported.body);
  assert.equal(imported.json().count, 2);
  assert.equal(new Set(imported.json().products.map((row) => row.variant_group_id)).size, 1);
  assert.equal(imported.json().products[0].name, 'Áo CSV · M · Đỏ');
  const replay = await app.inject({ method: 'POST', url, headers, payload });
  assert.equal(replay.statusCode, 201, replay.body);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
  const stock = await app.testDb.query(
    `SELECT count(*)::int AS products, sum(b.on_hand)::text AS quantity,
            (SELECT count(*)::int FROM audit_events a WHERE a.store_id = $1 AND a.action = 'product.variant_group_created') AS group_events
     FROM products p JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id
     WHERE p.store_id = $1`, [owner.store.id]
  );
  assert.equal(stock.rows[0].products, 2);
  assert.equal(stock.rows[0].quantity, '3.000');
  assert.equal(stock.rows[0].group_events, 1);
});
