ALTER TABLE store_sequences
  ADD COLUMN next_purchase_order_number bigint NOT NULL DEFAULT 1001 CHECK (next_purchase_order_number > 0);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  purchase_order_number text NOT NULL,
  supplier_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  subtotal_vnd bigint NOT NULL CHECK (subtotal_vnd >= 0),
  tax_vnd bigint NOT NULL DEFAULT 0 CHECK (tax_vnd >= 0),
  total_vnd bigint NOT NULL CHECK (total_vnd = subtotal_vnd + tax_vnd),
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ordered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, purchase_order_number),
  FOREIGN KEY (store_id, supplier_id) REFERENCES suppliers(store_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'draft' AND ordered_at IS NULL AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'ordered' AND ordered_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'partially_received' AND ordered_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
      OR (status = 'received' AND ordered_at IS NOT NULL AND completed_at IS NOT NULL AND cancelled_at IS NULL)
      OR (status = 'cancelled' AND cancelled_at IS NOT NULL))
);

CREATE TABLE purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity_ordered numeric(14,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered),
  unit_cost_vnd bigint NOT NULL CHECK (unit_cost_vnd >= 0),
  line_total_vnd bigint NOT NULL CHECK (line_total_vnd >= 0),
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, purchase_order_id) REFERENCES purchase_orders(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX purchase_orders_store_status_recent_idx ON purchase_orders (store_id, status, created_at DESC, id);
CREATE INDEX purchase_order_lines_store_order_idx ON purchase_order_lines (store_id, purchase_order_id, id);

ALTER TABLE purchases ADD COLUMN purchase_order_id uuid;
ALTER TABLE purchases ADD CONSTRAINT purchases_purchase_order_fk
  FOREIGN KEY (store_id, purchase_order_id) REFERENCES purchase_orders(store_id, id) ON DELETE RESTRICT;
CREATE INDEX purchases_store_purchase_order_idx ON purchases (store_id, purchase_order_id, occurred_at);

ALTER TABLE purchase_lines ADD COLUMN purchase_order_line_id uuid;
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_lines_purchase_order_line_fk
  FOREIGN KEY (store_id, purchase_order_line_id) REFERENCES purchase_order_lines(store_id, id) ON DELETE RESTRICT;
CREATE INDEX purchase_lines_store_purchase_order_line_idx ON purchase_lines (store_id, purchase_order_line_id);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON purchase_orders
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON purchase_order_lines
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
