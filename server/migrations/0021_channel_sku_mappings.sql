CREATE TABLE sales_channel_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  channel_code text NOT NULL CHECK (channel_code IN ('shopee', 'lazada', 'tiktok_shop', 'tiki', 'sendo', 'grabmart', 'website', 'other')),
  shop_label text NOT NULL CHECK (length(trim(shop_label)) BETWEEN 1 AND 120),
  connection_status text NOT NULL DEFAULT 'not_connected' CHECK (connection_status = 'not_connected'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX sales_channel_profiles_label_idx
  ON sales_channel_profiles (store_id, channel_code, lower(trim(shop_label)))
  WHERE status = 'active';
CREATE INDEX sales_channel_profiles_store_idx
  ON sales_channel_profiles (store_id, status, channel_code, created_at, id);

CREATE TABLE channel_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  channel_profile_id uuid NOT NULL,
  product_id uuid NOT NULL,
  external_sku text NOT NULL CHECK (length(trim(external_sku)) BETWEEN 1 AND 80),
  external_product_ref text NOT NULL DEFAULT '' CHECK (length(trim(external_product_ref)) <= 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  FOREIGN KEY (store_id, channel_profile_id) REFERENCES sales_channel_profiles(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX channel_mapping_active_product_idx
  ON channel_product_mappings (store_id, channel_profile_id, product_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX channel_mapping_active_external_sku_idx
  ON channel_product_mappings (store_id, channel_profile_id, lower(trim(external_sku)))
  WHERE status = 'active';
CREATE INDEX channel_mapping_product_idx
  ON channel_product_mappings (store_id, product_id, status, updated_at DESC, id);
CREATE INDEX channel_mapping_profile_idx
  ON channel_product_mappings (store_id, channel_profile_id, status, updated_at DESC, id);

ALTER TABLE sales_channel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_channel_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON sales_channel_profiles
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

ALTER TABLE channel_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_product_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON channel_product_mappings
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.sales_channel_profiles FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.sales_channel_profiles TO slink_app';
    EXECUTE 'REVOKE ALL ON public.channel_product_mappings FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.channel_product_mappings TO slink_app';
  END IF;
END;
$$;
