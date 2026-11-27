-- Slink 0.9.5.0 Audit Hardening & Store Member Display Name Isolation

-- 1. Persistent one-time security tickets (CAPTCHA challenges, registration tickets, password-change challenges)
CREATE TABLE IF NOT EXISTS consumed_security_tickets (
  ticket_id text PRIMARY KEY,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consumed_security_tickets_expires_idx
  ON consumed_security_tickets (expires_at);

-- 2. Store-scoped member display name so changing one store's staff label never overwrites global users.display_name
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS store_display_name text CHECK (store_display_name IS NULL OR length(store_display_name) <= 120);

-- 3. Prevent duplicate payroll settlement for the same (store_id, user_id, period_month)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY store_id, user_id, period_month ORDER BY paid_at DESC, id DESC) AS rn
  FROM staff_payslips
)
DELETE FROM staff_payslips sp
USING ranked r
WHERE sp.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS staff_payslips_store_user_period_uidx
  ON staff_payslips (store_id, user_id, period_month);

-- 4. Lock down append-only & ledger tables for slink_app runtime role (AUD-007)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.product_serial_codes, public.customer_point_ledger_entries, public.staff_payslips, public.pos_prebill_events FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.product_serial_codes TO slink_app;
    GRANT SELECT, INSERT ON public.customer_point_ledger_entries, public.staff_payslips TO slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.pos_prebill_events TO slink_app;
    REVOKE ALL ON public.consumed_security_tickets FROM slink_app;
    GRANT SELECT, INSERT, DELETE ON public.consumed_security_tickets TO slink_app;
  END IF;
END;
$$;
