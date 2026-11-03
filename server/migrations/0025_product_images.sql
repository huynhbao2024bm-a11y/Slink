ALTER TABLE products
  ADD COLUMN image_version integer NOT NULL DEFAULT 0 CHECK (image_version >= 0),
  ADD COLUMN image_content_type text CHECK (image_content_type IS NULL OR image_content_type = 'image/jpeg');

CREATE TABLE product_images (
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 262144),
  digest text NOT NULL CHECK (length(digest) = 64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id),
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT
);
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON product_images
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO slink_app;
  END IF;
END;
$$;
