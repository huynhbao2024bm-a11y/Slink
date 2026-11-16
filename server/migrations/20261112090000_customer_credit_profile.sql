ALTER TABLE customers
  ADD COLUMN shipping_address text NOT NULL DEFAULT '' CHECK (length(shipping_address) <= 500),
  ADD COLUMN customer_type text NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesale', 'vip')),
  ADD COLUMN credit_limit_vnd bigint CHECK (credit_limit_vnd IS NULL OR credit_limit_vnd >= 0);

CREATE INDEX customer_ledger_opening_source_idx
  ON customer_ledger_entries (store_id, customer_id, source_type, source_id);
