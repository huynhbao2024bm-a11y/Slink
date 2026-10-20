ALTER TABLE channel_product_mappings
  ADD CONSTRAINT channel_mapping_order_reference_key
  UNIQUE (store_id, channel_profile_id, id, product_id);

CREATE TABLE channel_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  channel_profile_id uuid NOT NULL,
  fulfillment_warehouse_id uuid NOT NULL,
  external_order_ref text NOT NULL CHECK (length(trim(external_order_ref)) BETWEEN 1 AND 120),
  external_order_ref_normalized text NOT NULL CHECK (length(external_order_ref_normalized) BETWEEN 1 AND 240),
  fulfillment_status text NOT NULL DEFAULT 'reserved'
    CHECK (fulfillment_status IN ('reserved', 'packed', 'shipped', 'delivered', 'cancelled')),
  payment_status_snapshot text NOT NULL DEFAULT 'unknown'
    CHECK (payment_status_snapshot IN ('unpaid', 'paid', 'cod', 'unknown')),
  total_vnd bigint NOT NULL CHECK (total_vnd >= 0),
  customer_name_snapshot text NOT NULL DEFAULT '' CHECK (length(customer_name_snapshot) <= 160),
  internal_note text NOT NULL DEFAULT '' CHECK (length(internal_note) <= 500),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  packed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, id, channel_profile_id),
  CONSTRAINT channel_orders_external_ref_key UNIQUE (store_id, channel_profile_id, external_order_ref_normalized),
  FOREIGN KEY (store_id, channel_profile_id)
    REFERENCES sales_channel_profiles(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, fulfillment_warehouse_id)
    REFERENCES warehouses(store_id, id) ON DELETE RESTRICT,
  CHECK (
    (fulfillment_status = 'reserved' AND packed_at IS NULL AND shipped_at IS NULL AND delivered_at IS NULL AND cancelled_at IS NULL)
    OR (fulfillment_status = 'packed' AND packed_at IS NOT NULL AND shipped_at IS NULL AND delivered_at IS NULL AND cancelled_at IS NULL)
    OR (fulfillment_status = 'shipped' AND packed_at IS NOT NULL AND shipped_at IS NOT NULL AND delivered_at IS NULL AND cancelled_at IS NULL)
    OR (fulfillment_status = 'delivered' AND packed_at IS NOT NULL AND shipped_at IS NOT NULL AND delivered_at IS NOT NULL AND cancelled_at IS NULL)
    OR (fulfillment_status = 'cancelled' AND shipped_at IS NULL AND delivered_at IS NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX channel_orders_store_status_idx
  ON channel_orders (store_id, fulfillment_status, created_at DESC, id);
CREATE INDEX channel_orders_profile_ref_idx
  ON channel_orders (store_id, channel_profile_id, external_order_ref);

CREATE TABLE channel_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  channel_profile_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 100),
  channel_mapping_id uuid NOT NULL,
  product_id uuid NOT NULL,
  external_sku_snapshot text NOT NULL CHECK (length(trim(external_sku_snapshot)) BETWEEN 1 AND 80),
  product_name_snapshot text NOT NULL CHECK (length(trim(product_name_snapshot)) BETWEEN 1 AND 240),
  internal_sku_snapshot text NOT NULL CHECK (length(trim(internal_sku_snapshot)) BETWEEN 1 AND 80),
  unit_snapshot text NOT NULL CHECK (length(trim(unit_snapshot)) BETWEEN 1 AND 40),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price_vnd bigint NOT NULL CHECK (unit_price_vnd >= 0),
  line_total_vnd bigint NOT NULL CHECK (line_total_vnd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, order_id, line_number),
  UNIQUE (store_id, order_id, product_id),
  FOREIGN KEY (store_id, order_id, channel_profile_id)
    REFERENCES channel_orders(store_id, id, channel_profile_id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, channel_profile_id, channel_mapping_id, product_id)
    REFERENCES channel_product_mappings(store_id, channel_profile_id, id, product_id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX channel_order_lines_order_idx ON channel_order_lines (store_id, order_id, line_number);
CREATE INDEX channel_order_lines_product_idx ON channel_order_lines (store_id, product_id, created_at DESC);

CREATE TABLE channel_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  from_status text CHECK (from_status IS NULL OR from_status IN ('reserved', 'packed', 'shipped', 'delivered', 'cancelled')),
  to_status text NOT NULL CHECK (to_status IN ('reserved', 'packed', 'shipped', 'delivered', 'cancelled')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES channel_orders(store_id, id) ON DELETE RESTRICT,
  CHECK (
    (event_type = 'created' AND from_status IS NULL AND to_status = 'reserved')
    OR (event_type = 'status_changed' AND from_status IS NOT NULL AND from_status <> to_status)
  )
);

CREATE INDEX channel_order_events_history_idx
  ON channel_order_events (store_id, order_id, occurred_at, id);

CREATE TRIGGER channel_order_events_append_only
  BEFORE UPDATE OR DELETE ON channel_order_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['channel_orders', 'channel_order_lines', 'channel_order_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %I USING (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid) WITH CHECK (store_id = NULLIF(current_setting(''app.store_id'', true), '''')::uuid)',
      target_table
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.channel_orders, public.channel_order_lines, public.channel_order_events FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.channel_orders, public.channel_order_lines, public.channel_order_events TO slink_app';
    EXECUTE 'GRANT UPDATE (fulfillment_status, version, updated_by, updated_at, packed_at, shipped_at, delivered_at, cancelled_at) ON public.channel_orders TO slink_app';
  END IF;
END;
$$;
