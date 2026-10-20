'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const { buildServer } = require('../server');

function parseLocalDatabaseUrl(value, role, databaseName, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} connection URL is missing or invalid.`); }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || url.port !== '5433'
      || decodeURIComponent(url.username) !== role
      || database !== databaseName) {
    throw new Error(`${label} must use role ${role} on local PostgreSQL port 5433 and database ${databaseName}.`);
  }
  return url;
}

async function snapshot(connectionString, label) {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    application_name: `slink-restore-acceptance-${label}`,
  });
  try {
    const identity = await pool.query(`
      SELECT current_user AS role_name,
             current_database() AS database_name,
             role.rolsuper,
             role.rolbypassrls
      FROM pg_catalog.pg_roles role
      WHERE role.rolname = current_user
    `);
    assert.equal(identity.rowCount, 1, `${label}: database role must be visible`);
    assert.equal(identity.rows[0].role_name, 'slink_migrator', `${label}: snapshot must use the migration role`);
    assert.equal(identity.rows[0].rolsuper, false, `${label}: snapshot role must not be a superuser`);
    assert.equal(identity.rows[0].rolbypassrls, true, `${label}: snapshot role must see all tenant rows`);

    const tables = await pool.query(`
      SELECT relation.relname AS table_name
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
      ORDER BY relation.relname
    `);
    const result = new Map();
    for (const { table_name: tableName } of tables.rows) {
      const quotedName = `"${tableName.replaceAll('"', '""')}"`;
      const rows = await pool.query(`
        SELECT to_jsonb(row_value)::text AS row_json
        FROM public.${quotedName} AS row_value
        ORDER BY to_jsonb(row_value)::text
      `);
      const digest = createHash('sha256');
      for (const { row_json: rowJson } of rows.rows) {
        digest.update(String(Buffer.byteLength(rowJson)));
        digest.update(':');
        digest.update(rowJson);
        digest.update('\n');
      }
      result.set(tableName, { rows: rows.rowCount, sha256: digest.digest('hex') });
    }

    const sequenceNames = await pool.query(`
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name
    `);
    const sequences = new Map();
    for (const { sequence_name: sequenceName } of sequenceNames.rows) {
      const quotedName = `"${sequenceName.replaceAll('"', '""')}"`;
      const state = await pool.query(`SELECT last_value::text, is_called FROM public.${quotedName}`);
      sequences.set(sequenceName, state.rows[0]);
    }

    const migration = await pool.query('SELECT count(*)::integer AS count, max(version) AS latest FROM public.schema_migrations');
    assert.equal(migration.rows[0].latest, '0016_customer_tags.sql', `${label}: expected the current migration set`);
    assert.equal(migration.rows[0].count, 16, `${label}: expected all 16 migrations`);
    for (const tableName of [
      'users', 'stores', 'products', 'orders', 'order_lines', 'payments',
      'inventory_movements', 'customer_ledger_entries', 'supplier_ledger_entries',
      'cash_register_sessions', 'cash_movements', 'audit_events',
    ]) {
      assert.ok((result.get(tableName)?.rows || 0) > 0, `${label}: expected restored acceptance data in ${tableName}`);
    }
    const testAccount = await pool.query(`
      SELECT email
      FROM public.users
      WHERE email LIKE 'native-acceptance-%@slink.invalid'
        AND status = 'active'
        AND email_verified_at IS NOT NULL
      ORDER BY email
      LIMIT 1
    `);
    assert.equal(testAccount.rowCount, 1, `${label}: expected one verified synthetic recovery account`);
    return { tables: result, sequences, acceptanceEmail: testAccount.rows[0].email };
  } finally {
    await pool.end();
  }
}

async function main() {
  const sourceName = process.env.SLINK_RESTORE_SOURCE_DATABASE || '';
  const targetName = process.env.SLINK_RESTORE_TARGET_DATABASE || '';
  if (!/^slink_accept_[a-f0-9]{12}$/.test(sourceName)
      || !/^slink_restore_[a-f0-9]{12}$/.test(targetName)
      || sourceName.slice(-12) !== targetName.slice(-12)) {
    throw new Error('Refusing to run: source and restore database names must come from the isolated local acceptance wrapper.');
  }

  const sourceUrl = parseLocalDatabaseUrl(process.env.MIGRATION_DATABASE_URL, 'slink_migrator', sourceName, 'Source');
  const targetUrl = parseLocalDatabaseUrl(process.env.MIGRATION_DATABASE_URL_RESTORED, 'slink_migrator', targetName, 'Restore');
  assert.equal(sourceUrl.hostname, targetUrl.hostname);
  assert.equal(sourceUrl.port, targetUrl.port);

  const source = await snapshot(sourceUrl.toString(), 'source');
  const restored = await snapshot(targetUrl.toString(), 'restored');
  assert.deepEqual(restored, source, 'Every public table and sequence must match the source backup.');
  process.stdout.write(`PASS restore preserved all ${source.tables.size} public tables row-for-row, sequence values, retail ledgers and audit history\n`);

  const appUrl = parseLocalDatabaseUrl(process.env.APP_DATABASE_URL, 'slink_app', targetName, 'Restored application');
  const appPool = new Pool({
    connectionString: appUrl.toString(),
    max: 2,
    connectionTimeoutMillis: 5000,
    application_name: 'slink-restored-api-acceptance',
  });
  const app = await buildServer({
    pool: appPool,
    logger: false,
    env: { NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://slink-restore-acceptance.invalid' },
  });
  try {
    const readiness = await app.inject({ method: 'GET', url: '/api/ready' });
    assert.equal(readiness.statusCode, 200, `Restored API readiness: ${readiness.body}`);
    assert.equal(readiness.json().status, 'ready');

    const origin = 'http://slink-restore-acceptance.invalid';
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email: source.acceptanceEmail, password: 'Native acceptance only 2026!' },
    });
    assert.equal(login.statusCode, 200, `Restored synthetic account sign-in: ${login.body}`);
    const setCookies = Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'] : [login.headers['set-cookie']];
    const cookies = setCookies.filter(Boolean).map((value) => value.split(';', 1)[0]).join('; ');
    assert.match(cookies, /(?:^|; )slink_session=/, 'restored account sign-in sets an authenticated session');
    const store = login.json().stores?.[0];
    assert.ok(store?.id, 'restored account retains an active store membership');
    const products = await app.inject({
      method: 'GET',
      url: `/api/stores/${store.id}/products`,
      headers: { cookie: cookies },
    });
    assert.equal(products.statusCode, 200, `Restored catalog read: ${products.body}`);
    assert.ok(products.json().products.some((product) => product.sku?.startsWith('NATIVE-')),
      'restored account can read its synthetic product catalog');
    process.stdout.write('PASS restored database is ready, authenticates the synthetic account, and serves its catalog through the application role\n');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`Native backup/restore acceptance failed: ${error.message}\n`);
  process.exitCode = 1;
});
