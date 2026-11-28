'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

test('RLS initplans cache context per statement and preserve reads, writes and context changes', async (t) => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE slink_test NOLOGIN;
    CREATE TABLE records (id int PRIMARY KEY, store_id uuid NOT NULL);
    INSERT INTO records SELECT g, CASE WHEN g % 2 = 0
      THEN '11111111-1111-4111-8111-111111111111'::uuid
      ELSE '22222222-2222-4222-8222-222222222222'::uuid END FROM generate_series(1,20000) g;
    ALTER TABLE records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_scope ON records USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
    GRANT SELECT,INSERT ON records TO slink_test;
    SET ROLE slink_test;
    SELECT set_config('app.store_id', '11111111-1111-4111-8111-111111111111', false);
  `);
  const count = async () => (await db.query('SELECT count(*)::int AS n FROM records')).rows[0].n;
  assert.equal(await count(), 10000);
  const before = await db.query('EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM records');
  await db.exec('RESET ROLE');
  const migration = await readFile(path.join(__dirname, '../migrations/20261128210000_rls_context_initplans.sql'), 'utf8');
  await db.exec(migration);
  // Applying again must preserve the already optimized policy.
  await db.exec(migration);
  const policy = (await db.query("SELECT qual,with_check FROM pg_policies WHERE tablename='records'")).rows[0];
  assert.match(policy.qual, /SELECT current_setting/);
  assert.match(policy.with_check, /SELECT current_setting/);
  await db.exec('SET ROLE slink_test');
  const after = await db.query('EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM records');
  assert.match(JSON.stringify(after.rows), /InitPlan/);
  assert.equal(await count(), 10000);
  await assert.rejects(db.exec("INSERT INTO records VALUES (20001,'22222222-2222-4222-8222-222222222222')"), /row-level security/);
  await db.exec("SELECT set_config('app.store_id', '22222222-2222-4222-8222-222222222222', false)");
  assert.equal(await count(), 10000);
  await db.exec("SELECT set_config('app.store_id', '', false)");
  assert.equal(await count(), 0);
  console.log(JSON.stringify({ fixture: '20000 synthetic rows, one store-scoped count',
    beforeMs: before.rows[0]['QUERY PLAN'][0]['Execution Time'],
    afterMs: after.rows[0]['QUERY PLAN'][0]['Execution Time'] }));
});
