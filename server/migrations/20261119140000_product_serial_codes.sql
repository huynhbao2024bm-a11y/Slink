-- Individual product serial/barcode unit tracking (1 code = 1 sellable unit, blocks re-selling sold codes)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS serial_tracked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS product_serial_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (char_length(btrim(code)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold', 'archived')),
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  sold_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_serial_codes_store_code_unique UNIQUE (store_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_serial_codes_store_lower_code_idx
  ON product_serial_codes (store_id, lower(code));

CREATE INDEX IF NOT EXISTS product_serial_codes_store_product_wh_status_idx
  ON product_serial_codes (store_id, product_id, warehouse_id, status);

CREATE INDEX IF NOT EXISTS product_serial_codes_store_order_idx
  ON product_serial_codes (store_id, order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE product_serial_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_serial_codes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_serial_codes' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON product_serial_codes
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    REVOKE ALL ON public.product_serial_codes FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.product_serial_codes TO slink_app;
  END IF;
END;
$$;
