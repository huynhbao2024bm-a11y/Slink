-- Business time may be supplied only by the validated offline operation path.
-- Audit/receipt timestamps continue to record the server's own time.
CREATE FUNCTION slink_operation_time() RETURNS timestamptz
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(NULLIF(current_setting('app.offline_occurred_at', true), '')::timestamptz, transaction_timestamp())
$$;

ALTER TABLE orders ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE payments ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE purchases ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE inventory_movements ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE customer_ledger_entries ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE supplier_ledger_entries ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE cash_movements ALTER COLUMN occurred_at SET DEFAULT slink_operation_time();
ALTER TABLE product_cost_history ALTER COLUMN created_at SET DEFAULT slink_operation_time();
ALTER TABLE cash_register_sessions ALTER COLUMN opened_at SET DEFAULT slink_operation_time();

CREATE TABLE offline_operation_receipts (
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 16 AND 200),
  device_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale', 'purchase', 'stock-count', 'cash', 'shift-open', 'shift-close')),
  entity_id uuid NOT NULL,
  client_occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, actor_user_id, operation_key)
);
ALTER TABLE offline_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_operation_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON offline_operation_receipts
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
CREATE TRIGGER offline_receipts_append_only BEFORE UPDATE OR DELETE ON offline_operation_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    GRANT SELECT, INSERT ON public.offline_operation_receipts TO slink_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.offline_operation_receipts FROM slink_app;
  END IF;
END;
$$;
