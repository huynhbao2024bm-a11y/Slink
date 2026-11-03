'use strict';

// Read metadata only. Refuse traffic when code was deployed before its schema.
async function assertRuntimeSchema(pool) {
  const result = await pool.query(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='workspace_mode')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='image_version')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='image_content_type')
      AND to_regclass('public.product_images') IS NOT NULL
      AND to_regclass('public.affiliate_links') IS NOT NULL AS compatible
  `);
  if (result.rows[0]?.compatible !== true) {
    throw new Error('Database schema is behind this application. Apply migrations through 0026_affiliate_workspace.sql before deploying.');
  }
}

module.exports = { assertRuntimeSchema };
