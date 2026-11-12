'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('AoLinks migration creates a tenant-scoped dry-run-only log table', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN NOSUPERUSER;
    CREATE TABLE stores (id uuid PRIMARY KEY);
    CREATE TABLE users (id uuid PRIMARY KEY);
  `);
  const migration = await readFile(path.resolve(__dirname, '../migrations/001_aolinks_run_log.sql'), 'utf8');
  await db.exec(migration);

  const table = await db.query(
    `SELECT c.relrowsecurity AS rls_enabled
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'automation_runs'`
  );
  const policy = await db.query(
    `SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'automation_runs'`
  );
  const privileges = await db.query(
    `SELECT has_table_privilege('slink_app', 'public.automation_runs', 'SELECT') AS can_select,
            has_table_privilege('slink_app', 'public.automation_runs', 'INSERT') AS can_insert,
            has_table_privilege('slink_app', 'public.automation_runs', 'UPDATE') AS can_update,
            has_table_privilege('slink_app', 'public.automation_runs', 'DELETE') AS can_delete`
  );
  assert.deepEqual(table.rows, [{ rls_enabled: true }]);
  assert.deepEqual(policy.rows, [{ policyname: 'tenant_scope' }]);
  assert.deepEqual(privileges.rows, [{
    can_select: true,
    can_insert: true,
    can_update: false,
    can_delete: false,
  }]);

  const storeId = 'c65c2ea6-81db-4c65-9ab3-53f774bf6b31';
  const userId = '8be51a88-4726-462c-a7bb-1f40e0f6a812';
  const otherStoreId = '69aa56d9-84d2-48a5-baca-3d5ad3bd47fd';
  await db.query('INSERT INTO stores (id) VALUES ($1)', [storeId]);
  await db.query('INSERT INTO stores (id) VALUES ($1)', [otherStoreId]);
  await db.query('INSERT INTO users (id) VALUES ($1)', [userId]);
  await db.query(
    `INSERT INTO automation_runs
      (store_id, actor_user_id, workflow_id, workflow_name, event_type, mode, status, result)
     VALUES ($1, $2, 'sample', 'Sample', 'order.created', 'dry_run', 'matched', '{"sideEffects":false}')`,
    [storeId, userId]
  );
  await db.query(
    `INSERT INTO automation_runs
      (store_id, actor_user_id, workflow_id, workflow_name, event_type, mode, status, result)
     VALUES ($1, $2, 'other', 'Other', 'order.created', 'dry_run', 'matched', '{"sideEffects":false}')`,
    [otherStoreId, userId]
  );

  await db.exec('BEGIN');
  await db.exec('SET LOCAL ROLE slink_app');
  await db.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
  const scopedRows = await db.query('SELECT store_id FROM automation_runs');
  assert.deepEqual(scopedRows.rows, [{ store_id: storeId }]);
  await db.exec('ROLLBACK');

  await assert.rejects(() => db.query(
    `INSERT INTO automation_runs
      (store_id, actor_user_id, workflow_id, workflow_name, event_type, mode, status, result)
     VALUES ($1, $2, 'sample', 'Sample', 'order.created', 'automatic', 'matched', '{}')`,
    [storeId, userId]
  ));
});
