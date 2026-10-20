const fs = require('node:fs/promises');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { Pool } = require('pg');
const { assertMigrationRole } = require('./migration-role');

const envFile = path.resolve(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NODE_ENV === 'production' && process.env.PG_SSL !== 'true') {
  throw new Error('Production database migrations require verified TLS. Set PG_SSL=true.');
}

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required.');

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

async function main() {
  const client = await pool.connect();
  let locked = false;
  try {
    const migrationRole = await client.query(`
      SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_schema
      FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
    `);
    assertMigrationRole(migrationRole.rows[0]);

    const applicationRole = await client.query(
      "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app'"
    );
    if (!applicationRole.rowCount) {
      throw new Error('Required PostgreSQL role slink_app is missing. Create it before running migrations.');
    }

    await client.query('SELECT pg_advisory_lock($1)', [741293847]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const directory = path.join(__dirname, 'migrations');
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const version of files) {
      const sql = await fs.readFile(path.join(directory, version), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('SELECT checksum FROM public.schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration was edited: ${version}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
        await client.query('COMMIT');
        process.stdout.write(`Applied ${version}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    await client.query(`
      GRANT USAGE ON SCHEMA public TO slink_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO slink_app;
      REVOKE ALL ON public.schema_migrations FROM slink_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON public.user_security_events FROM slink_app;
      GRANT SELECT, INSERT ON public.user_security_events TO slink_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON public.order_internal_notes, public.order_tag_events FROM slink_app;
      GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON public.customer_tag_events FROM slink_app;
      GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
      REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
      GRANT USAGE, SELECT ON SEQUENCE public.customer_tag_events_id_seq TO slink_app;
      REVOKE UPDATE, DELETE, TRUNCATE ON public.product_sale_price_history FROM slink_app;
      GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
      REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
      GRANT USAGE, SELECT ON SEQUENCE public.product_sale_price_history_id_seq TO slink_app;
    `);
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [741293847]);
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exitCode = 1;
});
