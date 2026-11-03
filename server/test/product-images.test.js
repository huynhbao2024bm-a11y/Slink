'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const { prepareProductImage } = require('../product-images');
const origin = 'http://images.test';

test('product image is atomic with stock, authenticated, versioned, replaceable and removable', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const directory = path.join(__dirname, '../migrations');
  for (const name of (await fs.readdir(directory)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await fs.readFile(path.join(directory, name), 'utf8'));
  await db.exec('CREATE ROLE slink_app NOLOGIN; GRANT USAGE ON SCHEMA public TO slink_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO slink_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;');
  const app = await buildServer({ pool: createPGlitePool(db), logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  t.after(() => app.close());
  async function user(suffix) {
    const email = suffix + '@images.test';
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin }, payload: { email, password: 'product photo test password 47', displayName: 'Test user', storeName: 'Test images' } });
    assert.equal(registration.statusCode, 201, registration.body);
    const token = new URLSearchParams(new URL(registration.json().developmentVerificationUrl).hash.slice(1)).get('token');
    await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'product photo test password 47' } });
    const cookies = login.cookies.map(c => c.name + '=' + c.value).join('; ');
    const csrf = login.cookies.find(c => c.name.includes('csrf')).value;
    return { id: login.json().user.id, storeId: login.json().stores[0].id, headers: { origin, cookie: cookies, 'x-csrf-token': csrf } };
  }
  const owner = await user('owner'); const stranger = await user('stranger');
  const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#367557' } }).png().toBuffer();
  const image = 'data:image/png;base64,' + png.toString('base64');
  const payload = { items: [{ sku: 'PHOTO-1', name: 'Photo product', salePriceVnd: 150000, costVnd: 80000, openingQuantity: '12', image }] };
  const headers = { ...owner.headers, 'idempotency-key': randomUUID() };
  const created = await app.inject({ method: 'POST', url: `/api/stores/${owner.storeId}/products/import`, headers, payload });
  assert.equal(created.statusCode, 201, created.body); const product = created.json().products[0];
  assert.equal(product.image_version, 1); assert.equal(product.image_content_type, 'image/jpeg'); assert.equal(Number(product.on_hand), 12);
  const replay = await app.inject({ method: 'POST', url: `/api/stores/${owner.storeId}/products/import`, headers, payload });
  assert.equal(replay.json().products[0].id, product.id); assert.equal(replay.json().products[0].image_version, 1);
  const url = `/api/stores/${owner.storeId}/products/${product.id}/image`;
  const fetched = await app.inject({ url, headers: owner.headers }); assert.equal(fetched.statusCode, 200); assert.equal(fetched.headers['content-type'], 'image/jpeg');
  const meta = await sharp(fetched.rawPayload).metadata(); assert.ok(meta.width <= 720 && meta.height <= 720); assert.equal(meta.exif, undefined);
  assert.equal((await app.inject({ url, headers: { ...owner.headers, 'if-none-match': fetched.headers.etag } })).statusCode, 304);
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: stranger.headers })).statusCode, 403);
  const list = await app.inject({ url: `/api/stores/${owner.storeId}/products`, headers: owner.headers }); assert.equal(list.json().products[0].image_content_type, 'image/jpeg'); assert.ok(!list.body.includes('base64'));
  let changed = await app.inject({ method: 'PUT', url: `/api/stores/${owner.storeId}/products/${product.id}`, headers: owner.headers, payload: { version: product.version, image: null } });
  assert.equal(changed.statusCode, 200, changed.body); assert.equal(changed.json().product.image_version, 2); assert.equal((await app.inject({ url, headers: owner.headers })).statusCode, 404);
  changed = await app.inject({ method: 'PUT', url: `/api/stores/${owner.storeId}/products/${product.id}`, headers: owner.headers, payload: { version: changed.json().product.version, image } }); assert.equal(changed.statusCode, 200, changed.body); assert.equal(changed.json().product.image_version, 3);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/stores/${owner.storeId}/products/${product.id}`, headers: owner.headers, payload: { version: 1, image: null } })).statusCode, 409);
  await db.query("UPDATE memberships SET role='cashier' WHERE user_id=$1 AND store_id=$2", [owner.id, owner.storeId]);
  assert.equal((await app.inject({ url, headers: owner.headers })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: `/api/stores/${owner.storeId}/products/${product.id}`, headers: owner.headers, payload: { version: changed.json().product.version, image: null } })).statusCode, 403);
  await db.query("UPDATE memberships SET role='owner' WHERE user_id=$1 AND store_id=$2", [owner.id, owner.storeId]);
  await db.exec("CREATE FUNCTION reject_test_image_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='product.image_saved' THEN RAISE EXCEPTION 'image audit test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_image_rollback BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_test_image_audit();");
  const failed = await app.inject({ method: 'POST', url: `/api/stores/${owner.storeId}/products/import`, headers: { ...owner.headers, 'idempotency-key': randomUUID() }, payload: { items: [{ ...payload.items[0], sku: 'ROLLBACK-IMAGE' }] } });
  assert.equal(failed.statusCode, 500); assert.equal((await db.query("SELECT count(*)::int AS count FROM products WHERE sku='ROLLBACK-IMAGE'")).rows[0].count, 0);
});

test('photo decoding rejects invalid and vector content, with bounded storage', async () => {
  for (const value of ['', 'data:image/png;base64,AAAA', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString('base64'), 'x'.repeat(700001)]) {
    await assert.rejects(() => prepareProductImage(value), { code: 'invalid_product_image' });
  }
});
