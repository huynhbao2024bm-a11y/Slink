'use strict';

const assert = require('node:assert/strict');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');

test('warehouse migration backfills movement location metadata and restores append-only protection', async (t) => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  t.after(() => db.close());

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql') && name < '0011_warehouses_transfers.sql')
    .sort();
  for (const name of migrationFiles) {
    await db.exec(await readFile(path.join(migrationsDirectory, name), 'utf8'));
  }

  const storeId = randomUUID();
  const userId = randomUUID();
  const productId = randomUUID();
  const movementId = randomUUID();
  await db.query('INSERT INTO stores (id, name) VALUES ($1, $2)', [storeId, 'Cửa hàng kho lịch sử']);
  await db.query(
    'INSERT INTO users (id, email, email_normalized, display_name, password_hash) VALUES ($1, $2, $3, $4, $5)',
    [userId, `${userId}@example.com`, `${userId}@example.com`, 'Chủ cửa hàng', 'test-only-hash'],
  );
  await db.query(
    'INSERT INTO products (id, store_id, sku, sku_normalized, name) VALUES ($1, $2, $3, $4, $5)',
    [productId, storeId, `SKU-${productId}`, `sku-${productId}`, 'Hàng đã có lịch sử'],
  );
  await db.query(
    'INSERT INTO inventory_balances (store_id, product_id, on_hand) VALUES ($1, $2, $3)',
    [storeId, productId, '1'],
  );
  await db.query(
    `INSERT INTO inventory_movements
      (id, store_id, product_id, movement_type, quantity_delta, quantity_after, reason, actor_user_id)
     VALUES ($1, $2, $3, 'opening', 1, 1, 'Tồn đầu kỳ', $4)`,
    [movementId, storeId, productId, userId],
  );

  await db.exec(await readFile(path.join(migrationsDirectory, '0011_warehouses_transfers.sql'), 'utf8'));

  const { rows } = await db.query(
    'SELECT warehouse_id, quantity_delta, quantity_after, reason FROM inventory_movements WHERE id = $1',
    [movementId],
  );
  assert.equal(rows.length, 1);
  assert.ok(rows[0].warehouse_id, 'historical movement receives its default warehouse');
  assert.equal(rows[0].quantity_delta, '1.000');
  assert.equal(rows[0].quantity_after, '1.000');
  assert.equal(rows[0].reason, 'Tồn đầu kỳ');
  await assert.rejects(
    db.query('UPDATE inventory_movements SET reason = $1 WHERE id = $2', ['Sửa lịch sử', movementId]),
    /append-only/i,
  );
});
