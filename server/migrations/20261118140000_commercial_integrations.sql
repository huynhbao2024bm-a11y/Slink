-- Commercial integrations config (non-secret routing metadata) + webhook idempotency + query scale indexes

ALTER TABLE stores
  ADD COLUMN bank_bin text DEFAULT '' CHECK (bank_bin = '' OR bank_bin ~ '^\d{6}$'),
  ADD COLUMN bank_code text NOT NULL DEFAULT '',
  ADD COLUMN bank_name text NOT NULL DEFAULT '',
  ADD COLUMN bank_account_number text NOT NULL DEFAULT '',
  ADD COLUMN bank_account_name text NOT NULL DEFAULT '',
  ADD COLUMN bank_webhook_provider text NOT NULL DEFAULT 'none' CHECK (bank_webhook_provider IN ('none', 'sepay', 'casso', 'payos')),
  ADD COLUMN einvoice_provider text NOT NULL DEFAULT 'none' CHECK (einvoice_provider IN ('none', 'misa', 'viettel', 'vnpt')),
  ADD COLUMN tax_code text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_template_code text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_serial text NOT NULL DEFAULT '',
  ADD COLUMN shipping_provider text NOT NULL DEFAULT 'none' CHECK (shipping_provider IN ('none', 'ghn', 'ghtk', 'viettelpost'));

ALTER TABLE orders
  ADD COLUMN shipping_provider text NOT NULL DEFAULT '',
  ADD COLUMN shipping_tracking_code text NOT NULL DEFAULT '',
  ADD COLUMN shipping_fee_vnd bigint NOT NULL DEFAULT 0 CHECK (shipping_fee_vnd >= 0),
  ADD COLUMN shipping_status text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_provider text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_number text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_lookup_code text NOT NULL DEFAULT '',
  ADD COLUMN einvoice_status text NOT NULL DEFAULT 'none' CHECK (einvoice_status IN ('none', 'issued', 'failed', 'cancelled'));

CREATE TABLE integration_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('sepay', 'casso', 'payos', 'momo', 'vnpay', 'ghn', 'ghtk', 'viettelpost', 'shopee', 'tiktok')),
  external_event_id text NOT NULL CHECK (length(trim(external_event_id)) BETWEEN 1 AND 200),
  payload_digest bytea NOT NULL,
  matched_order_id uuid,
  status text NOT NULL CHECK (status IN ('processed', 'ignored', 'duplicate', 'failed')),
  detail text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider, external_event_id),
  FOREIGN KEY (store_id, matched_order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT
);

ALTER TABLE integration_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhook_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON integration_webhook_events
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

CREATE INDEX orders_store_status_occurred_idx ON orders (store_id, status, occurred_at DESC);
CREATE INDEX cash_movements_store_method_occurred_idx ON cash_movements (store_id, method, occurred_at DESC);
CREATE INDEX orders_shipping_tracking_idx ON orders (store_id, shipping_tracking_code) WHERE shipping_tracking_code <> '';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    REVOKE ALL ON public.integration_webhook_events FROM slink_app;
    GRANT SELECT, INSERT ON public.integration_webhook_events TO slink_app;
  END IF;
END;
$$;
