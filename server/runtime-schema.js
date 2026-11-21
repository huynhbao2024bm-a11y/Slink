'use strict';

// Read metadata only. Refuse traffic when code was deployed before its schema.
async function assertRuntimeSchema(pool) {
  const result = await pool.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='workspace_mode')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='image_version')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='image_content_type')
      AND to_regclass('public.product_images') IS NOT NULL
      AND to_regclass('public.affiliate_links') IS NOT NULL
      AND to_regclass('public.offline_operation_receipts') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='purchase_pack')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_lines' AND column_name='purchase_pack')
      AND to_regclass('public.integration_webhook_events') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='bank_bin')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='einvoice_status')
      AND to_regclass('public.cash_categories') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_movements' AND column_name='voucher_number')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' AND column_name='commission_rate_bps')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='customer_code')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='extra_barcodes')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='serial_tracked')
      AND to_regclass('public.product_serial_codes') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='warranty_months')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_serial_codes' AND column_name='warranty_expires_at')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='memberships' AND column_name='permissions') AS compatible
  `);
  if (result.rows[0]?.compatible !== true) {
    throw new Error('Database schema is behind this application. Apply migrations through 20261121100000_warranty_granular_rbac.sql before deploying.');
  }
}

module.exports = { assertRuntimeSchema };
