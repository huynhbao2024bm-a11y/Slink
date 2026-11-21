-- Đợt 2: Product warranty months, per-serial warranty expiration, and granular RBAC permissions

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS warranty_months integer NOT NULL DEFAULT 0
  CHECK (warranty_months >= 0 AND warranty_months <= 1200);

ALTER TABLE product_serial_codes
  ADD COLUMN IF NOT EXISTS warranty_expires_at timestamptz;

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(permissions) = 'object');
