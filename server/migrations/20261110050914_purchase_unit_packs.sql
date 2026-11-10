-- Optional defaults and a receipt snapshot; existing stock and amounts are untouched.
ALTER TABLE products ADD COLUMN purchase_pack jsonb;
ALTER TABLE products ADD CONSTRAINT product_purchase_pack_object
  CHECK (purchase_pack IS NULL OR jsonb_typeof(purchase_pack) = 'object');
ALTER TABLE purchase_lines ADD COLUMN purchase_pack jsonb;
ALTER TABLE purchase_lines ADD CONSTRAINT purchase_line_pack_object
  CHECK (purchase_pack IS NULL OR jsonb_typeof(purchase_pack) = 'object');
