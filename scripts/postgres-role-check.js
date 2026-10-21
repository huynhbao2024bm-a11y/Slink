const path = require('node:path');
const { existsSync } = require('node:fs');
const { Pool } = require('pg');
const { databaseTransportOptions } = require('../server/database-transport');

const envFile = path.resolve(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required.');

const pool = new Pool({
  connectionString,
  ...databaseTransportOptions(process.env, connectionString, 'MIGRATION_DATABASE_URL'),
  max: 1,
  connectionTimeoutMillis: 10000,
});

async function main() {
  try {
    const migrationRole = await pool.query(`
      SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_schema
      FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
    `);
    if (!migrationRole.rowCount) throw new Error('Cannot inspect the connected migration role.');

    const tables = await pool.query(`
      SELECT to_regclass('public.schema_migrations') AS migration_table,
        to_regclass('public.user_security_events') AS security_table,
        to_regclass('public.customer_tag_events') AS customer_tag_table,
        to_regclass('public.customer_saved_segments') AS customer_saved_segments_table,
        to_regclass('public.promotions') AS promotions_table,
        to_regclass('public.promotion_redemptions') AS promotion_redemptions_table,
        to_regclass('public.product_sale_price_history') AS product_sale_price_history_table,
        to_regclass('public.sales_channel_profiles') AS sales_channel_profiles_table,
        to_regclass('public.channel_product_mappings') AS channel_product_mappings_table,
        to_regclass('public.channel_orders') AS channel_orders_table,
        to_regclass('public.channel_order_lines') AS channel_order_lines_table,
        to_regclass('public.channel_order_events') AS channel_order_events_table
    `);
    if (!tables.rows[0].migration_table || !tables.rows[0].security_table || !tables.rows[0].customer_tag_table || !tables.rows[0].customer_saved_segments_table || !tables.rows[0].promotions_table || !tables.rows[0].promotion_redemptions_table || !tables.rows[0].product_sale_price_history_table || !tables.rows[0].sales_channel_profiles_table || !tables.rows[0].channel_product_mappings_table || !tables.rows[0].channel_orders_table || !tables.rows[0].channel_order_lines_table || !tables.rows[0].channel_order_events_table) {
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
        has_table_privilege(app.rolname, 'public.customer_tag_events', 'SELECT') AS customer_tags_select,
        has_table_privilege(app.rolname, 'public.customer_tag_events', 'INSERT') AS customer_tags_insert,
        has_table_privilege(app.rolname, 'public.customer_tag_events', 'UPDATE') AS customer_tags_update,
        has_table_privilege(app.rolname, 'public.customer_tag_events', 'DELETE') AS customer_tags_delete,
        has_table_privilege(app.rolname, 'public.customer_tag_events', 'TRUNCATE') AS customer_tags_truncate,
        has_sequence_privilege(app.rolname, 'public.customer_tag_events_id_seq', 'USAGE') AS customer_tags_sequence_usage,
        has_sequence_privilege(app.rolname, 'public.customer_tag_events_id_seq', 'SELECT') AS customer_tags_sequence_select,
        has_sequence_privilege(app.rolname, 'public.customer_tag_events_id_seq', 'UPDATE') AS customer_tags_sequence_update,
        has_table_privilege(app.rolname, 'public.customer_saved_segments', 'SELECT') AS customer_segments_select,
        has_table_privilege(app.rolname, 'public.customer_saved_segments', 'INSERT') AS customer_segments_insert,
        has_table_privilege(app.rolname, 'public.customer_saved_segments', 'UPDATE') AS customer_segments_update,
        has_table_privilege(app.rolname, 'public.customer_saved_segments', 'DELETE') AS customer_segments_delete,
        has_table_privilege(app.rolname, 'public.customer_saved_segments', 'TRUNCATE') AS customer_segments_truncate,
        has_table_privilege(app.rolname, 'public.promotions', 'SELECT') AS promotions_select,
        has_table_privilege(app.rolname, 'public.promotions', 'INSERT') AS promotions_insert,
        has_table_privilege(app.rolname, 'public.promotions', 'UPDATE') AS promotions_update,
        has_table_privilege(app.rolname, 'public.promotions', 'DELETE') AS promotions_delete,
        has_table_privilege(app.rolname, 'public.promotions', 'TRUNCATE') AS promotions_truncate,
        has_table_privilege(app.rolname, 'public.promotion_redemptions', 'SELECT') AS promotion_redemptions_select,
        has_table_privilege(app.rolname, 'public.promotion_redemptions', 'INSERT') AS promotion_redemptions_insert,
        has_table_privilege(app.rolname, 'public.promotion_redemptions', 'UPDATE') AS promotion_redemptions_update,
        has_table_privilege(app.rolname, 'public.promotion_redemptions', 'DELETE') AS promotion_redemptions_delete,
        has_table_privilege(app.rolname, 'public.promotion_redemptions', 'TRUNCATE') AS promotion_redemptions_truncate,
        has_table_privilege(app.rolname, 'public.product_sale_price_history', 'SELECT') AS sale_prices_select,
        has_table_privilege(app.rolname, 'public.product_sale_price_history', 'INSERT') AS sale_prices_insert,
        has_table_privilege(app.rolname, 'public.product_sale_price_history', 'UPDATE') AS sale_prices_update,
        has_table_privilege(app.rolname, 'public.product_sale_price_history', 'DELETE') AS sale_prices_delete,
        has_table_privilege(app.rolname, 'public.product_sale_price_history', 'TRUNCATE') AS sale_prices_truncate,
        has_sequence_privilege(app.rolname, 'public.product_sale_price_history_id_seq', 'USAGE') AS sale_prices_sequence_usage,
        has_sequence_privilege(app.rolname, 'public.product_sale_price_history_id_seq', 'SELECT') AS sale_prices_sequence_select,
        has_sequence_privilege(app.rolname, 'public.product_sale_price_history_id_seq', 'UPDATE') AS sale_prices_sequence_update,
        NOT EXISTS (
          SELECT 1 FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'public'
            AND relation.relkind IN ('r', 'p', 'v', 'm', 'S')
            AND relation.relowner = app.oid
        ) AS app_owns_no_public_objects,
        security.relowner <> app.oid AS app_does_not_own_security_table,
        customer_tags.relowner <> app.oid AS app_does_not_own_customer_tag_table,
        customer_segments.relowner <> app.oid AS app_does_not_own_customer_segments_table,
        security.relrowsecurity AS events_rls_enabled,
        security.relforcerowsecurity AS events_rls_forced,
        customer_tags.relrowsecurity AS customer_tags_rls_enabled,
        customer_tags.relforcerowsecurity AS customer_tags_rls_forced,
        customer_segments.relrowsecurity AS customer_segments_rls_enabled,
        customer_segments.relforcerowsecurity AS customer_segments_rls_forced,
        promotions.relowner <> app.oid AS app_does_not_own_promotions_table,
        redemptions.relowner <> app.oid AS app_does_not_own_promotion_redemptions_table,
        sale_prices.relowner <> app.oid AS app_does_not_own_sale_price_history_table,
        promotions.relrowsecurity AS promotions_rls_enabled,
        promotions.relforcerowsecurity AS promotions_rls_forced,
        redemptions.relrowsecurity AS promotion_redemptions_rls_enabled,
        redemptions.relforcerowsecurity AS promotion_redemptions_rls_forced,
        sale_prices.relrowsecurity AS sale_prices_rls_enabled,
        sale_prices.relforcerowsecurity AS sale_prices_rls_forced,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public'
            AND policy.tablename = 'user_security_events'
            AND policy.policyname = 'account_scope'
            AND policy.cmd = 'ALL'
            AND position('app.user_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.user_id' IN coalesce(policy.with_check, '')) > 0
        ) AS events_policy_is_user_scoped,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public'
            AND policy.tablename = 'customer_tag_events'
            AND policy.policyname = 'tenant_scope'
            AND policy.cmd = 'ALL'
            AND position('app.store_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.store_id' IN coalesce(policy.with_check, '')) > 0
        ) AS customer_tags_policy_is_tenant_scoped,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public'
            AND policy.tablename = 'customer_saved_segments'
            AND policy.policyname = 'tenant_scope'
            AND policy.cmd = 'ALL'
            AND position('app.store_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.store_id' IN coalesce(policy.with_check, '')) > 0
        ) AS customer_segments_policy_is_tenant_scoped,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public' AND policy.tablename = 'promotions'
            AND policy.policyname = 'tenant_scope' AND policy.cmd = 'ALL'
            AND position('app.store_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.store_id' IN coalesce(policy.with_check, '')) > 0
        ) AS promotions_policy_is_tenant_scoped,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public' AND policy.tablename = 'promotion_redemptions'
            AND policy.policyname = 'tenant_scope' AND policy.cmd = 'ALL'
            AND position('app.store_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.store_id' IN coalesce(policy.with_check, '')) > 0
        ) AS promotion_redemptions_policy_is_tenant_scoped,
        EXISTS (
          SELECT 1 FROM pg_policies policy
          WHERE policy.schemaname = 'public' AND policy.tablename = 'product_sale_price_history'
            AND policy.policyname = 'tenant_scope' AND policy.cmd = 'ALL'
            AND position('app.store_id' IN coalesce(policy.qual, '')) > 0
            AND position('app.store_id' IN coalesce(policy.with_check, '')) > 0
        ) AS sale_prices_policy_is_tenant_scoped
      FROM pg_roles app
      JOIN pg_class security ON security.oid = to_regclass('public.user_security_events')
      JOIN pg_class customer_tags ON customer_tags.oid = to_regclass('public.customer_tag_events')
      JOIN pg_class customer_segments ON customer_segments.oid = to_regclass('public.customer_saved_segments')
      JOIN pg_class promotions ON promotions.oid = to_regclass('public.promotions')
      JOIN pg_class redemptions ON redemptions.oid = to_regclass('public.promotion_redemptions')
      JOIN pg_class sale_prices ON sale_prices.oid = to_regclass('public.product_sale_price_history')
      WHERE app.rolname = 'slink_app'
    `);
    if (!result.rowCount) throw new Error('The slink_app role is missing.');

    const row = result.rows[0];
    const migration = migrationRole.rows[0];
    const channelTables = await pool.query(`
      SELECT
        has_table_privilege('slink_app', 'public.sales_channel_profiles', 'SELECT') AS profiles_select,
        has_table_privilege('slink_app', 'public.sales_channel_profiles', 'INSERT') AS profiles_insert,
        has_table_privilege('slink_app', 'public.sales_channel_profiles', 'UPDATE') AS profiles_update,
        has_table_privilege('slink_app', 'public.sales_channel_profiles', 'DELETE') AS profiles_delete,
        has_table_privilege('slink_app', 'public.sales_channel_profiles', 'TRUNCATE') AS profiles_truncate,
        has_table_privilege('slink_app', 'public.channel_product_mappings', 'SELECT') AS mappings_select,
        has_table_privilege('slink_app', 'public.channel_product_mappings', 'INSERT') AS mappings_insert,
        has_table_privilege('slink_app', 'public.channel_product_mappings', 'UPDATE') AS mappings_update,
        has_table_privilege('slink_app', 'public.channel_product_mappings', 'DELETE') AS mappings_delete,
        has_table_privilege('slink_app', 'public.channel_product_mappings', 'TRUNCATE') AS mappings_truncate,
        (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.sales_channel_profiles'::regclass) AS profiles_forced_rls,
        (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.channel_product_mappings'::regclass) AS mappings_forced_rls,
        (SELECT relowner <> 'slink_app'::regrole FROM pg_class WHERE oid = 'public.sales_channel_profiles'::regclass) AS profiles_not_owned,
        (SELECT relowner <> 'slink_app'::regrole FROM pg_class WHERE oid = 'public.channel_product_mappings'::regclass) AS mappings_not_owned,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sales_channel_profiles' AND policyname = 'tenant_scope' AND cmd = 'ALL' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS profiles_tenant_policy,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channel_product_mappings' AND policyname = 'tenant_scope' AND cmd = 'ALL' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS mappings_tenant_policy,
        has_table_privilege('slink_app', 'public.channel_orders', 'SELECT') AS orders_select,
        has_table_privilege('slink_app', 'public.channel_orders', 'INSERT') AS orders_insert,
        has_table_privilege('slink_app', 'public.channel_orders', 'UPDATE') AS orders_table_update,
        has_column_privilege('slink_app', 'public.channel_orders', 'fulfillment_status', 'UPDATE') AS orders_status_update,
        has_column_privilege('slink_app', 'public.channel_orders', 'version', 'UPDATE') AS orders_version_update,
        has_column_privilege('slink_app', 'public.channel_orders', 'total_vnd', 'UPDATE') AS orders_total_update,
        has_column_privilege('slink_app', 'public.channel_orders', 'customer_phone_snapshot', 'UPDATE') AS orders_phone_update,
        has_column_privilege('slink_app', 'public.channel_orders', 'shipping_address_snapshot', 'UPDATE') AS orders_address_update,
        has_table_privilege('slink_app', 'public.channel_orders', 'DELETE') AS orders_delete,
        has_table_privilege('slink_app', 'public.channel_orders', 'TRUNCATE') AS orders_truncate,
        has_table_privilege('slink_app', 'public.channel_order_lines', 'SELECT') AS lines_select,
        has_table_privilege('slink_app', 'public.channel_order_lines', 'INSERT') AS lines_insert,
        has_table_privilege('slink_app', 'public.channel_order_lines', 'UPDATE') AS lines_update,
        has_table_privilege('slink_app', 'public.channel_order_lines', 'DELETE') AS lines_delete,
        has_table_privilege('slink_app', 'public.channel_order_lines', 'TRUNCATE') AS lines_truncate,
        has_table_privilege('slink_app', 'public.channel_order_events', 'SELECT') AS order_events_select,
        has_table_privilege('slink_app', 'public.channel_order_events', 'INSERT') AS order_events_insert,
        has_table_privilege('slink_app', 'public.channel_order_events', 'UPDATE') AS order_events_update,
        has_table_privilege('slink_app', 'public.channel_order_events', 'DELETE') AS order_events_delete,
        has_table_privilege('slink_app', 'public.channel_order_events', 'TRUNCATE') AS order_events_truncate,
        (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.channel_orders'::regclass) AS orders_forced_rls,
        (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.channel_order_lines'::regclass) AS lines_forced_rls,
        (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.channel_order_events'::regclass) AS order_events_forced_rls,
        (SELECT relowner <> 'slink_app'::regrole FROM pg_class WHERE oid = 'public.channel_orders'::regclass) AS orders_not_owned,
        (SELECT relowner <> 'slink_app'::regrole FROM pg_class WHERE oid = 'public.channel_order_lines'::regclass) AS lines_not_owned,
        (SELECT relowner <> 'slink_app'::regrole FROM pg_class WHERE oid = 'public.channel_order_events'::regclass) AS order_events_not_owned,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channel_orders' AND policyname = 'tenant_scope' AND cmd = 'ALL' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS orders_tenant_policy,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channel_order_lines' AND policyname = 'tenant_scope' AND cmd = 'ALL' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS lines_tenant_policy,
        EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channel_order_events' AND policyname = 'tenant_scope' AND cmd = 'ALL' AND position('app.store_id' IN coalesce(qual, '')) > 0 AND position('app.store_id' IN coalesce(with_check, '')) > 0) AS order_events_tenant_policy
    `);
    const channel = channelTables.rows[0];
    const checks = [
      ['connected as slink_migrator', migration.role_name === 'slink_migrator'],
      ['migration role is not a superuser', !migration.rolsuper],
      ['migration role can bypass forced tenant RLS for backfills', migration.rolbypassrls],
      ['migration role can create in the public schema', migration.can_create_public_schema],
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
      ['can read customer tag history', row.customer_tags_select],
      ['can insert customer tag history', row.customer_tags_insert],
      ['cannot update customer tag history', !row.customer_tags_update],
      ['cannot delete customer tag history', !row.customer_tags_delete],
      ['cannot truncate customer tag history', !row.customer_tags_truncate],
      ['can allocate customer tag IDs without changing the sequence', row.customer_tags_sequence_usage && row.customer_tags_sequence_select && !row.customer_tags_sequence_update],
      ['can read saved customer segments', row.customer_segments_select],
      ['can create saved customer segments', row.customer_segments_insert],
      ['can update saved customer segments', row.customer_segments_update],
      ['can delete saved customer segments', row.customer_segments_delete],
      ['cannot truncate saved customer segments', !row.customer_segments_truncate],
      ['can read promotions', row.promotions_select],
      ['can create and update promotions', row.promotions_insert && row.promotions_update],
      ['cannot delete promotions', !row.promotions_delete],
      ['cannot truncate promotions', !row.promotions_truncate],
      ['can read promotion redemption history', row.promotion_redemptions_select],
      ['can insert promotion redemption history', row.promotion_redemptions_insert],
      ['cannot update promotion redemption history', !row.promotion_redemptions_update],
      ['cannot delete promotion redemption history', !row.promotion_redemptions_delete],
      ['cannot truncate promotion redemption history', !row.promotion_redemptions_truncate],
      ['can read and append sale-price history', row.sale_prices_select && row.sale_prices_insert],
      ['cannot update, delete or truncate sale-price history', !row.sale_prices_update && !row.sale_prices_delete && !row.sale_prices_truncate],
      ['can allocate sale-price history IDs without changing the sequence', row.sale_prices_sequence_usage && row.sale_prices_sequence_select && !row.sale_prices_sequence_update],
      ['owns no public database objects', row.app_owns_no_public_objects],
      ['does not own the security table', row.app_does_not_own_security_table],
      ['does not own the customer tag table', row.app_does_not_own_customer_tag_table],
      ['does not own the saved customer segments table', row.app_does_not_own_customer_segments_table],
      ['does not own the promotions table', row.app_does_not_own_promotions_table],
      ['does not own the promotion redemption table', row.app_does_not_own_promotion_redemptions_table],
      ['does not own the sale-price history table', row.app_does_not_own_sale_price_history_table],
      ['security-event RLS is enabled and forced', row.events_rls_enabled && row.events_rls_forced],
      ['security-event policy scopes reads and writes by user', row.events_policy_is_user_scoped],
      ['customer-tag RLS is enabled and forced', row.customer_tags_rls_enabled && row.customer_tags_rls_forced],
      ['customer-tag policy scopes reads and writes by store', row.customer_tags_policy_is_tenant_scoped],
      ['saved-customer-segment RLS is enabled and forced', row.customer_segments_rls_enabled && row.customer_segments_rls_forced],
      ['saved-customer-segment policy scopes reads and writes by store', row.customer_segments_policy_is_tenant_scoped],
      ['promotion RLS is enabled and forced', row.promotions_rls_enabled && row.promotions_rls_forced],
      ['promotion policy scopes reads and writes by store', row.promotions_policy_is_tenant_scoped],
      ['promotion-redemption RLS is enabled and forced', row.promotion_redemptions_rls_enabled && row.promotion_redemptions_rls_forced],
      ['promotion-redemption policy scopes reads and writes by store', row.promotion_redemptions_policy_is_tenant_scoped],
      ['sale-price history RLS is enabled and forced', row.sale_prices_rls_enabled && row.sale_prices_rls_forced],
      ['sale-price history policy scopes reads and writes by store', row.sale_prices_policy_is_tenant_scoped],
      ['can read and create channel profiles', channel.profiles_select && channel.profiles_insert],
      ['can update channel profiles', channel.profiles_update],
      ['cannot delete or truncate channel profiles', !channel.profiles_delete && !channel.profiles_truncate],
      ['can read, create and update channel SKU mappings', channel.mappings_select && channel.mappings_insert && channel.mappings_update],
      ['cannot delete or truncate channel SKU mappings', !channel.mappings_delete && !channel.mappings_truncate],
      ['does not own channel tables', channel.profiles_not_owned && channel.mappings_not_owned],
      ['channel profile and SKU mapping RLS is enabled and forced', channel.profiles_forced_rls && channel.mappings_forced_rls],
      ['channel profile and SKU mapping policies scope access by store', channel.profiles_tenant_policy && channel.mappings_tenant_policy],
      ['can read and create channel orders', channel.orders_select && channel.orders_insert],
      ['can update only fulfillment status fields on channel orders', !channel.orders_table_update && channel.orders_status_update && channel.orders_version_update && !channel.orders_total_update && !channel.orders_phone_update && !channel.orders_address_update],
      ['cannot delete or truncate channel orders', !channel.orders_delete && !channel.orders_truncate],
      ['can read and create channel-order lines', channel.lines_select && channel.lines_insert],
      ['cannot update, delete or truncate channel-order lines', !channel.lines_update && !channel.lines_delete && !channel.lines_truncate],
      ['can read and append channel-order history', channel.order_events_select && channel.order_events_insert],
      ['cannot update, delete or truncate channel-order history', !channel.order_events_update && !channel.order_events_delete && !channel.order_events_truncate],
      ['channel-order tables are not owned by the application role', channel.orders_not_owned && channel.lines_not_owned && channel.order_events_not_owned],
      ['channel-order RLS is enabled and forced', channel.orders_forced_rls && channel.lines_forced_rls && channel.order_events_forced_rls],
      ['channel-order policies scope access by store', channel.orders_tenant_policy && channel.lines_tenant_policy && channel.order_events_tenant_policy],
    ];

    process.stdout.write(`Database: ${row.database_name}\n`);
    for (const [label, passed] of checks) process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${label}\n`);
    if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`PostgreSQL role check failed: ${error.message}\n`);
  process.exitCode = 1;
});
