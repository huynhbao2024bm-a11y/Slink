CREATE TABLE product_sale_price_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL,
  previous_price_vnd bigint CHECK (previous_price_vnd IS NULL OR previous_price_vnd >= 0),
  new_price_vnd bigint NOT NULL CHECK (new_price_vnd >= 0),
  source_type text NOT NULL CHECK (source_type IN (
    'created', 'csv_import', 'manual_adjustment', 'bulk_update', 'migration_baseline'
  )),
  source_id uuid,
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT,
  CHECK (previous_price_vnd IS DISTINCT FROM new_price_vnd)
);

CREATE INDEX product_sale_price_history_lookup_idx
  ON product_sale_price_history (store_id, product_id, id DESC);

ALTER TABLE product_sale_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sale_price_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON product_sale_price_history
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

CREATE TRIGGER product_sale_price_history_append_only
  BEFORE UPDATE OR DELETE ON product_sale_price_history
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

INSERT INTO product_sale_price_history (
  store_id, product_id, previous_price_vnd, new_price_vnd, source_type, created_at
)
SELECT store_id, id, NULL, sale_price_vnd, 'migration_baseline', now()
FROM products;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.product_sale_price_history FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app';
    EXECUTE 'REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.product_sale_price_history_id_seq TO slink_app';
  END IF;
END;
$$;
