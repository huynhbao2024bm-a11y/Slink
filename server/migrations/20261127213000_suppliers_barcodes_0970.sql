-- Slink 0.9.7.0: Standardize Suppliers (NCC) 360 profile + Configurable Barcode Rules

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS tax_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_store_code_uidx
  ON suppliers (store_id, lower(code))
  WHERE status = 'active' AND code IS NOT NULL AND code <> '';

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS allow_duplicate_barcodes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_generate_barcode boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS products_store_barcode_idx;
CREATE INDEX IF NOT EXISTS products_store_barcode_lookup_idx
  ON products (store_id, barcode)
  WHERE barcode IS NOT NULL;
