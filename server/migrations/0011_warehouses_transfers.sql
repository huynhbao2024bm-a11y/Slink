CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 32),
  code_normalized text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, code_normalized)
);

CREATE UNIQUE INDEX warehouses_one_default_per_store_idx ON warehouses (store_id) WHERE is_default;
CREATE INDEX warehouses_store_status_idx ON warehouses (store_id, status, name);

INSERT INTO warehouses (store_id, code, code_normalized, name, is_default)
SELECT id, 'MAIN', 'main', 'Kho chính', true FROM stores;

ALTER TABLE inventory_balances ADD COLUMN warehouse_id uuid;
UPDATE inventory_balances b SET warehouse_id = w.id
FROM warehouses w WHERE w.store_id = b.store_id AND w.is_default;
ALTER TABLE inventory_balances ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE inventory_balances DROP CONSTRAINT inventory_balances_pkey;
ALTER TABLE inventory_balances ADD PRIMARY KEY (store_id, warehouse_id, product_id);
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_warehouse_fk
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT;

ALTER TABLE inventory_movements ADD COLUMN warehouse_id uuid;
-- The warehouse assignment is derived location metadata, not a change to the
-- historical quantity/event. Temporarily bypass only this guard inside the
-- migration transaction; any failure rolls back and restores the trigger state.
ALTER TABLE inventory_movements DISABLE TRIGGER inventory_movements_append_only;
UPDATE inventory_movements m SET warehouse_id = b.warehouse_id
FROM inventory_balances b WHERE b.store_id = m.store_id AND b.product_id = m.product_id;
ALTER TABLE inventory_movements ENABLE TRIGGER inventory_movements_append_only;
ALTER TABLE inventory_movements ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_warehouse_fk
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT;
CREATE INDEX inventory_movements_warehouse_product_idx ON inventory_movements (store_id, warehouse_id, product_id, occurred_at DESC);

ALTER TABLE orders ADD COLUMN warehouse_id uuid;
UPDATE orders o SET warehouse_id = w.id
FROM warehouses w WHERE w.store_id = o.store_id AND w.is_default;
ALTER TABLE orders ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_warehouse_fk
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT;

ALTER TABLE purchases ADD COLUMN warehouse_id uuid;
UPDATE purchases p SET warehouse_id = w.id
FROM warehouses w WHERE w.store_id = p.store_id AND w.is_default;
ALTER TABLE purchases ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE purchases ADD CONSTRAINT purchases_warehouse_fk
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_orders ADD COLUMN warehouse_id uuid;
UPDATE purchase_orders p SET warehouse_id = w.id
FROM warehouses w WHERE w.store_id = p.store_id AND w.is_default;
ALTER TABLE purchase_orders ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_warehouse_fk
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT;
CREATE INDEX purchase_orders_store_warehouse_status_idx
  ON purchase_orders (store_id, warehouse_id, status)
  WHERE status IN ('draft', 'ordered', 'partially_received');

CREATE TABLE warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  transfer_number text NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'partially_received', 'received', 'cancelled')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  dispatched_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, transfer_number),
  FOREIGN KEY (store_id, source_warehouse_id) REFERENCES warehouses(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, destination_warehouse_id) REFERENCES warehouses(store_id, id) ON DELETE RESTRICT,
  CHECK (source_warehouse_id <> destination_warehouse_id)
);

CREATE TABLE warehouse_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity_sent numeric(14,3) NOT NULL CHECK (quantity_sent > 0),
  quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_sent),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, transfer_id, product_id),
  FOREIGN KEY (store_id, transfer_id) REFERENCES warehouse_transfers(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX warehouse_transfers_store_created_idx ON warehouse_transfers (store_id, created_at DESC, id);
CREATE INDEX warehouse_transfer_lines_transfer_idx ON warehouse_transfer_lines (store_id, transfer_id, product_id);

CREATE TABLE store_transfer_sequences (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE RESTRICT,
  next_transfer_number bigint NOT NULL DEFAULT 1001 CHECK (next_transfer_number > 0)
);
INSERT INTO store_transfer_sequences (store_id) SELECT id FROM stores;

CREATE FUNCTION slink_create_default_warehouse() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO warehouses (store_id, code, code_normalized, name, is_default)
  VALUES (NEW.id, 'MAIN', 'main', 'Kho chính', true);
  INSERT INTO store_transfer_sequences (store_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER stores_create_default_warehouse
AFTER INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION slink_create_default_warehouse();

CREATE FUNCTION slink_set_default_inventory_warehouse() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.warehouse_id IS NULL THEN
    SELECT id INTO NEW.warehouse_id FROM warehouses
    WHERE store_id = NEW.store_id AND is_default AND status = 'active';
    IF NEW.warehouse_id IS NULL THEN
      RAISE EXCEPTION 'No active default warehouse for store %', NEW.store_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_balances_default_warehouse
BEFORE INSERT ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION slink_set_default_inventory_warehouse();
CREATE TRIGGER inventory_movements_default_warehouse
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION slink_set_default_inventory_warehouse();

CREATE TRIGGER orders_default_warehouse
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION slink_set_default_inventory_warehouse();
CREATE TRIGGER purchases_default_warehouse
BEFORE INSERT ON purchases
FOR EACH ROW EXECUTE FUNCTION slink_set_default_inventory_warehouse();
CREATE TRIGGER purchase_orders_default_warehouse
BEFORE INSERT ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION slink_set_default_inventory_warehouse();

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['warehouses', 'warehouse_transfers', 'warehouse_transfer_lines', 'store_transfer_sequences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I USING (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid) WITH CHECK (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)',
      target_table
    );
  END LOOP;
END;
$$;
