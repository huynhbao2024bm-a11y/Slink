ALTER TABLE products
  ADD COLUMN variant_group_id uuid,
  ADD COLUMN variant_group_name text,
  ADD COLUMN variant_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE products
  ADD CONSTRAINT products_variant_attributes_object
    CHECK (jsonb_typeof(variant_attributes) = 'object'),
  ADD CONSTRAINT products_variant_group_shape
    CHECK (
      (variant_group_id IS NULL AND variant_group_name IS NULL AND variant_attributes = '{}'::jsonb)
      OR
      (variant_group_id IS NOT NULL AND variant_group_name IS NOT NULL
       AND length(trim(variant_group_name)) BETWEEN 1 AND 200
       AND variant_attributes <> '{}'::jsonb)
    );

CREATE UNIQUE INDEX products_variant_group_attributes_idx
  ON products (store_id, variant_group_id, lower(variant_attributes::text))
  WHERE variant_group_id IS NOT NULL;

CREATE INDEX products_variant_group_lookup_idx
  ON products (store_id, variant_group_id, status, name)
  WHERE variant_group_id IS NOT NULL;
