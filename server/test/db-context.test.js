'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { withStore, withUser } = require('../db');
const { createPGlitePool } = require('../pglite-test-pool');

test('store transaction uses one RLS context query and preserves isolation, revocation, rollback and pool reuse', async (t) => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  t.after(() => db.close());
  const directory = path.join(__dirname, '..', 'migrations');
  for (const migration of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(path.join(directory, migration), 'utf8'));
  }
  await db.exec(`CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;`);
  const pool = createPGlitePool(db);
  const owners = [{ user: randomUUID(), store: randomUUID() }, { user: randomUUID(), store: randomUUID() }];
  for (const owner of owners) {
    await withUser(pool, owner.user, async client => {
      await client.query("SELECT set_config('app.store_id', $1, true)", [owner.store]);
      await client.query('INSERT INTO users (id,email,email_normalized,display_name,password_hash) VALUES ($1,$2,$2,$3,$4)',
        [owner.user, owner.user + '@example.test', 'Owner', 'test-hash']);
      await client.query('INSERT INTO stores (id,name) VALUES ($1,$2)', [owner.store, 'Original']);
      await client.query("INSERT INTO memberships (user_id,store_id,role) VALUES ($1,$2,'owner')", [owner.user, owner.store]);
    });
  }
  const queries = [];
  const measuredPool = { async connect() {
    const client = await pool.connect();
    return { query(sql, params) { queries.push(sql); return client.query(sql, params); }, release() { client.release(); } };
  } };
  const owner = owners[0];
  const result = await withStore(measuredPool, owner.user, owner.store, async (client, membership) => {
    assert.equal(membership.role, 'owner');
    return client.query("SELECT id, current_setting('app.user_id') AS user_id FROM stores");
  });
  assert.deepEqual(result.rows, [{ id: owner.store, user_id: owner.user }]);
  assert.equal(queries.length, 5, 'BEGIN + combined context + membership + data + COMMIT');
  assert.equal(queries.filter(sql => sql.includes('set_config')).length, 1);
  await assert.rejects(withStore(pool, owner.user, owners[1].store, () => assert.fail('cross-store access')), { statusCode: 403 });
  await assert.rejects(withStore(pool, owner.user, owner.store, async client => {
    await client.query('UPDATE stores SET name=$1 WHERE id=$2', ['Rollback', owner.store]);
    throw new Error('abort write');
  }), /abort write/);
  await withStore(pool, owner.user, owner.store, async client => {
    const store = await client.query('SELECT name FROM stores WHERE id=$1', [owner.store]);
    assert.equal(store.rows[0].name, 'Original');
    await client.query("UPDATE memberships SET status='suspended' WHERE store_id=$1 AND user_id=$2", [owner.store, owner.user]);
  });
  await assert.rejects(withStore(pool, owner.user, owner.store, () => assert.fail('revoked access')), { statusCode: 403 });
  await withUser(pool, owners[1].user, async client => {
    const context = await client.query("SELECT current_setting('app.store_id', true) AS store_id, current_setting('app.user_id') AS user_id");
    assert.equal(context.rows[0].store_id || '', '');
    assert.equal(context.rows[0].user_id, owners[1].user);
  });
});
