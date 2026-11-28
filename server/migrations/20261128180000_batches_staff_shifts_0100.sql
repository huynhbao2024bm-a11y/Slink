-- Slink 0.10.0: Optional Product Batches & Expiry (FEFO) + Staff Work Schedule & Shifts

-- 1. Optional batch/expiry tracking per product
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS batch_tracked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  batch_code text NOT NULL CHECK (length(trim(batch_code)) BETWEEN 1 AND 80),
  expiry_date date,
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  cost_vnd bigint CHECK (cost_vnd IS NULL OR cost_vnd >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_batches_unique_code_uidx
  ON product_batches (store_id, product_id, warehouse_id, lower(batch_code));

CREATE INDEX IF NOT EXISTS product_batches_fefo_idx
  ON product_batches (store_id, product_id, warehouse_id, expiry_date ASC NULLS LAST, received_at ASC);

CREATE INDEX IF NOT EXISTS product_batches_expiry_alert_idx
  ON product_batches (store_id, expiry_date ASC)
  WHERE quantity > 0 AND expiry_date IS NOT NULL;

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_batches' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON product_batches
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;

-- 2. Staff Shift Scheduling & Attendance Check-in / Check-out
CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  shift_type text NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'full')),
  shift_label text NOT NULL DEFAULT '' CHECK (length(shift_label) <= 60),
  start_time text NOT NULL DEFAULT '08:00' CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time text NOT NULL DEFAULT '12:00' CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'checked_in', 'completed', 'late', 'absent')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_unique_slot_uidx
  ON staff_shifts (store_id, user_id, work_date, shift_type);

CREATE INDEX IF NOT EXISTS staff_shifts_store_date_idx
  ON staff_shifts (store_id, work_date, shift_type);

ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_shifts' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON staff_shifts
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;
