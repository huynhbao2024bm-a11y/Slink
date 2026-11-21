-- Owner-First Zero-Touch HR & CRM Suite (v0.7.0)
-- 1. Store loyalty & Margin Guard defaults
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS loyalty_earn_unit_vnd bigint NOT NULL DEFAULT 100000 CHECK (loyalty_earn_unit_vnd > 0),
  ADD COLUMN IF NOT EXISTS loyalty_redeem_value_vnd bigint NOT NULL DEFAULT 1000 CHECK (loyalty_redeem_value_vnd > 0),
  ADD COLUMN IF NOT EXISTS protect_cost_margin boolean NOT NULL DEFAULT true;

-- 2. Staff salary mode, workdays & bank account for 1-tap VietQR payroll
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS salary_mode text NOT NULL DEFAULT 'monthly' CHECK (salary_mode IN ('monthly', 'shift', 'hourly')),
  ADD COLUMN IF NOT EXISTS standard_days_per_month integer NOT NULL DEFAULT 26 CHECK (standard_days_per_month BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS bank_bin text CHECK (bank_bin IS NULL OR length(bank_bin) <= 20),
  ADD COLUMN IF NOT EXISTS bank_account_number text CHECK (bank_account_number IS NULL OR length(bank_account_number) <= 40),
  ADD COLUMN IF NOT EXISTS bank_account_owner text CHECK (bank_account_owner IS NULL OR length(bank_account_owner) <= 120);

-- 3. Order seller attribution, loyalty points redemption/earning & F8 prebill link
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS points_redeemed integer NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  ADD COLUMN IF NOT EXISTS points_redeemed_vnd bigint NOT NULL DEFAULT 0 CHECK (points_redeemed_vnd >= 0),
  ADD COLUMN IF NOT EXISTS points_earned integer NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  ADD COLUMN IF NOT EXISTS prebill_event_id uuid;

CREATE INDEX IF NOT EXISTS orders_store_seller_occurred_idx
  ON orders (store_id, seller_id, occurred_at DESC);

-- 4. Link salary advances & payroll disbursements on cash_movements to employee & payslip
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS employee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_payslip_id uuid;

CREATE INDEX IF NOT EXISTS cash_movements_store_employee_idx
  ON cash_movements (store_id, employee_user_id)
  WHERE employee_user_id IS NOT NULL;

-- 5. Track settled/waived cash register session variances for payroll
ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS settled_payslip_id uuid,
  ADD COLUMN IF NOT EXISTS variance_waived boolean NOT NULL DEFAULT false;

-- 6. Atomic Customer Point Ledger
CREATE TABLE IF NOT EXISTS customer_point_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN (
    'earn_sale',
    'redeem_sale',
    'return_refund_points',
    'return_clawback_points',
    'manual_adjustment'
  )),
  points_delta integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_point_ledger_store_customer_idx
  ON customer_point_ledger_entries (store_id, customer_id, occurred_at DESC);

ALTER TABLE customer_point_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_point_ledger_entries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_point_ledger_entries' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON customer_point_ledger_entries
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;

-- 7. 1-Tap Staff Payslips
CREATE TABLE IF NOT EXISTS staff_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  payslip_number text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  period_month text NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  salary_mode_snapshot text NOT NULL,
  worked_units numeric(6,2) NOT NULL DEFAULT 0,
  base_pay_vnd bigint NOT NULL DEFAULT 0,
  net_sales_vnd bigint NOT NULL DEFAULT 0,
  commission_pay_vnd bigint NOT NULL DEFAULT 0,
  bonus_vnd bigint NOT NULL DEFAULT 0,
  advance_deduction_vnd bigint NOT NULL DEFAULT 0,
  shortage_deduction_vnd bigint NOT NULL DEFAULT 0,
  net_payable_vnd bigint NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'bank_qr', 'card', 'other')),
  cash_movement_id uuid,
  settled_advance_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  settled_shortage_session_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  note text NOT NULL DEFAULT '',
  paid_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_payslips_store_number_unique UNIQUE (store_id, payslip_number)
);

CREATE INDEX IF NOT EXISTS staff_payslips_store_period_user_idx
  ON staff_payslips (store_id, period_month, user_id, paid_at DESC);

ALTER TABLE staff_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payslips FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'staff_payslips' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON staff_payslips
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;

-- 8. POS F8 Pre-bill Events for Loss-Prevention / Anti-Fraud Radar
CREATE TABLE IF NOT EXISTS pos_prebill_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subtotal_vnd bigint NOT NULL CHECK (subtotal_vnd >= 0),
  expected_total_vnd bigint NOT NULL CHECK (expected_total_vnd >= 0),
  line_count integer NOT NULL CHECK (line_count > 0),
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'printed' CHECK (status IN ('printed', 'completed', 'abandoned_or_shrunk')),
  matched_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  printed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_prebill_events_store_printed_idx
  ON pos_prebill_events (store_id, printed_at DESC);

ALTER TABLE pos_prebill_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_prebill_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pos_prebill_events' AND policyname = 'tenant_scope'
  ) THEN
    CREATE POLICY tenant_scope ON pos_prebill_events
      USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
      WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    REVOKE ALL ON public.customer_point_ledger_entries FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.customer_point_ledger_entries TO slink_app;
    REVOKE ALL ON public.staff_payslips FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.staff_payslips TO slink_app;
    REVOKE ALL ON public.pos_prebill_events FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.pos_prebill_events TO slink_app;
  END IF;
END;
$$;
