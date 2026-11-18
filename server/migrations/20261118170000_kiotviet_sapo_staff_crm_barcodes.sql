ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS staff_code text CHECK (staff_code IS NULL OR length(staff_code) <= 40),
  ADD COLUMN IF NOT EXISTS phone text CHECK (phone IS NULL OR length(phone) <= 32),
  ADD COLUMN IF NOT EXISTS job_title text NOT NULL DEFAULT '' CHECK (length(job_title) <= 120),
  ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  ADD COLUMN IF NOT EXISTS commission_rate_bps integer NOT NULL DEFAULT 0 CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 10000),
  ADD COLUMN IF NOT EXISTS base_salary_vnd bigint NOT NULL DEFAULT 0 CHECK (base_salary_vnd >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS memberships_store_staff_code_idx
  ON memberships (store_id, lower(staff_code))
  WHERE staff_code IS NOT NULL;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_customer_type_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_customer_type_check CHECK (customer_type IN ('retail', 'wholesale', 'vip', 'agency')),
  ADD COLUMN IF NOT EXISTS customer_code text CHECK (customer_code IS NULL OR length(customer_code) <= 40),
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IS NULL OR gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '' CHECK (length(company_name) <= 160),
  ADD COLUMN IF NOT EXISTS tax_code text NOT NULL DEFAULT '' CHECK (length(tax_code) <= 40),
  ADD COLUMN IF NOT EXISTS discount_rate_bps integer NOT NULL DEFAULT 0 CHECK (discount_rate_bps >= 0 AND discount_rate_bps <= 10000),
  ADD COLUMN IF NOT EXISTS bonus_points integer NOT NULL DEFAULT 0 CHECK (bonus_points >= -1000000 AND bonus_points <= 10000000);

CREATE UNIQUE INDEX IF NOT EXISTS customers_store_code_idx
  ON customers (store_id, lower(customer_code))
  WHERE customer_code IS NOT NULL AND status = 'active';

ALTER TABLE customer_saved_segments
  DROP CONSTRAINT IF EXISTS customer_saved_segments_segment_key_check;

ALTER TABLE customer_saved_segments
  ADD CONSTRAINT customer_saved_segments_segment_key_check
  CHECK (segment_key IN ('no_purchase', 'repeat', 'owing', 'inactive90', 'vip_tier', 'wholesale', 'birthday_month', 'over_credit_limit'));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS extra_barcodes text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(extra_barcodes) <= 20);

CREATE INDEX IF NOT EXISTS products_store_extra_barcodes_idx
  ON products USING GIN (extra_barcodes);
