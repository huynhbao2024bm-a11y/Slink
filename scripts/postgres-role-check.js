const path = require('node:path');
const { existsSync } = require('node:fs');
const { Pool } = require('pg');

const envFile = path.resolve(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (process.env.NODE_ENV === 'production' && process.env.PG_SSL !== 'true') {
  throw new Error('Production role checks require verified database TLS. Set PG_SSL=true.');
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
  try {
    const tables = await pool.query(`
      SELECT to_regclass('public.schema_migrations') AS migration_table,
        to_regclass('public.user_security_events') AS security_table
    `);
    if (!tables.rows[0].migration_table || !tables.rows[0].security_table) {
      throw new Error('Expected migration or account-security table is missing. Apply database migrations first.');
    }

    const result = await pool.query(`
      SELECT current_database() AS database_name,
        app.rolsuper AS app_superuser,
        app.rolbypassrls AS app_bypass_rls,
        (app.rolcreatedb OR app.rolcreaterole OR app.rolreplication) AS app_has_admin_capability,
        NOT EXISTS (SELECT 1 FROM pg_auth_members membership WHERE membership.member = app.oid) AS app_has_no_role_memberships,
        has_schema_privilege(app.rolname, 'public', 'CREATE') AS app_can_create_schema,
        has_table_privilege(app.rolname, 'public.schema_migrations', 'SELECT') AS migration_select,
        has_table_privilege(app.rolname, 'public.schema_migrations', 'INSERT') AS migration_insert,
        has_table_privilege(app.rolname, 'public.schema_migrations', 'UPDATE') AS migration_update,
        has_table_privilege(app.rolname, 'public.schema_migrations', 'DELETE') AS migration_delete,
        has_table_privilege(app.rolname, 'public.schema_migrations', 'TRUNCATE') AS migration_truncate,
        has_table_privilege(app.rolname, 'public.user_security_events', 'SELECT') AS events_select,
        has_table_privilege(app.rolname, 'public.user_security_events', 'INSERT') AS events_insert,
        has_table_privilege(app.rolname, 'public.user_security_events', 'UPDATE') AS events_update,
        has_table_privilege(app.rolname, 'public.user_security_events', 'DELETE') AS events_delete,
        has_table_privilege(app.rolname, 'public.user_security_events', 'TRUNCATE') AS events_truncate,
        NOT EXISTS (
          SELECT 1 FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
            AND relation.relowner = app.oid
        ) AS app_owns_no_public_objects,
        security.relowner <> app.oid AS app_does_not_own_security_table,
        security.relrowsecurity AS events_rls_enabled,
        security.relforcerowsecurity AS events_rls_forced,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public'
            AND policy.tablename = 'user_security_events'
            AND policy.policyname = 'account_scope'
            AND policy.cmd = 'ALL'
            AND position('app.user_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.user_id' IN coalesce(policy.with_check, '')) > 0
        ) AS events_policy_is_user_scoped
      FROM pg_roles app
      JOIN pg_class security ON security.oid = to_regclass('public.user_security_events')
      WHERE app.rolname = 'slink_app'
    `);
    if (!result.rowCount) throw new Error('The slink_app role is missing.');

    const row = result.rows[0];
    const checks = [
      ['not a superuser', !row.app_superuser],
      ['does not bypass RLS', !row.app_bypass_rls],
      ['has no database, role-management or replication privileges', !row.app_has_admin_capability],
      ['has no inherited role memberships', row.app_has_no_role_memberships],
      ['cannot create in public schema', !row.app_can_create_schema],
      ['cannot read or change schema_migrations', !row.migration_select && !row.migration_insert && !row.migration_update && !row.migration_delete && !row.migration_truncate],
      ['can read security events', row.events_select],
      ['can insert security events', row.events_insert],
      ['cannot update security events', !row.events_update],
      ['cannot delete security events', !row.events_delete],
      ['cannot truncate security events', !row.events_truncate],
      ['owns no public database objects', row.app_owns_no_public_objects],
      ['does not own the security table', row.app_does_not_own_security_table],
      ['security-event RLS is enabled and forced', row.events_rls_enabled && row.events_rls_forced],
      ['security-event policy scopes reads and writes by user', row.events_policy_is_user_scoped],
    ];

    process.stdout.write(`Database: ${row.database_name}\n`);
    for (const [label, passed] of checks) process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${label}\n`);
    if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`Application-role check failed: ${error.message}\n`);
  process.exitCode = 1;
});
