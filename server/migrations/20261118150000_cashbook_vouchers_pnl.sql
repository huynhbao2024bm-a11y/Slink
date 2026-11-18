-- Cashbook separation (cash vs bank), sequential voucher numbers, internal transfers, immutable reversals, and P&L tracking

ALTER TABLE store_sequences
  ADD COLUMN next_receipt_voucher_number bigint NOT NULL DEFAULT 1001 CHECK (next_receipt_voucher_number >= 1),
  ADD COLUMN next_payment_voucher_number bigint NOT NULL DEFAULT 1001 CHECK (next_payment_voucher_number >= 1),
  ADD COLUMN next_transfer_voucher_number bigint NOT NULL DEFAULT 1001 CHECK (next_transfer_voucher_number >= 1);

CREATE TABLE cash_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('in', 'out', 'both')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  default_include_in_pnl boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cash_categories_store_name_dir_idx
  ON cash_categories (store_id, lower(trim(name)), direction)
  WHERE status = 'active';

ALTER TABLE cash_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON cash_categories
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

ALTER TABLE cash_movements
  ADD COLUMN voucher_number text NOT NULL DEFAULT '',
  ADD COLUMN fund_type text NOT NULL DEFAULT 'cash' CHECK (fund_type IN ('cash', 'bank')),
  ADD COLUMN movement_kind text NOT NULL DEFAULT 'standard' CHECK (movement_kind IN ('standard', 'transfer', 'reversal')),
  ADD COLUMN transfer_group_id uuid,
  ADD COLUMN reverses_movement_id uuid,
  ADD COLUMN category_id uuid,
  ADD COLUMN include_in_pnl boolean NOT NULL DEFAULT false,
  ADD COLUMN counterparty_kind text CHECK (counterparty_kind IS NULL OR counterparty_kind IN ('customer', 'supplier', 'staff', 'other')),
  ADD COLUMN counterparty_id uuid,
  ADD COLUMN counterparty_name text NOT NULL DEFAULT '',
  ADD COLUMN void_reason text NOT NULL DEFAULT '';

ALTER TABLE cash_movements
  ADD CONSTRAINT cash_movements_store_id_unique UNIQUE (store_id, id);

ALTER TABLE cash_movements
  ADD CONSTRAINT cash_movements_reverses_fk
  FOREIGN KEY (store_id, reverses_movement_id)
  REFERENCES cash_movements(store_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX cash_movements_single_reversal_idx
  ON cash_movements (store_id, reverses_movement_id)
  WHERE reverses_movement_id IS NOT NULL;

CREATE INDEX cash_movements_store_fund_date_idx
  ON cash_movements (store_id, fund_type, occurred_at DESC);

CREATE INDEX cash_movements_store_pnl_date_idx
  ON cash_movements (store_id, include_in_pnl, occurred_at DESC);

ALTER TABLE cash_movements DISABLE TRIGGER cash_movements_append_only;

WITH numbered AS (
  SELECT id,
         direction,
         method,
         source_type,
         category,
         row_number() OVER (PARTITION BY store_id, direction ORDER BY occurred_at ASC, created_at ASC, id ASC) AS seq_no
  FROM cash_movements
)
UPDATE cash_movements cm
SET
  fund_type = CASE WHEN numbered.method = 'cash' THEN 'cash' ELSE 'bank' END,
  voucher_number = CASE
    WHEN numbered.direction = 'in' THEN 'PT-' || lpad(numbered.seq_no::text, 4, '0')
    ELSE 'PC-' || lpad(numbered.seq_no::text, 4, '0')
  END,
  include_in_pnl = (
    numbered.source_type = 'manual_cash_movement'
    AND lower(numbered.category) NOT LIKE '%góp vốn%'
    AND lower(numbered.category) NOT LIKE '%gop von%'
    AND lower(numbered.category) NOT LIKE '%rút vốn%'
    AND lower(numbered.category) NOT LIKE '%rut von%'
  )
FROM numbered
WHERE cm.id = numbered.id;

ALTER TABLE cash_movements ENABLE TRIGGER cash_movements_append_only;

UPDATE store_sequences ss
SET
  next_receipt_voucher_number = GREATEST(
    ss.next_receipt_voucher_number,
    COALESCE((SELECT COUNT(*) + 1 FROM cash_movements cm WHERE cm.store_id = ss.store_id AND cm.direction = 'in'), 1001)
  ),
  next_payment_voucher_number = GREATEST(
    ss.next_payment_voucher_number,
    COALESCE((SELECT COUNT(*) + 1 FROM cash_movements cm WHERE cm.store_id = ss.store_id AND cm.direction = 'out'), 1001)
  );

INSERT INTO cash_categories (store_id, direction, name, default_include_in_pnl, is_system)
SELECT s.id, v.direction, v.name, v.pnl, true
FROM stores s
CROSS JOIN (VALUES
  ('out', 'Tiền thuê mặt bằng', true),
  ('out', 'Điện, nước & Internet', true),
  ('out', 'Lương & Thưởng nhân viên', true),
  ('out', 'Vận chuyển & Đóng gói', true),
  ('out', 'Quảng cáo & Phí sàn TMĐT', true),
  ('out', 'Chi phí vận hành khác', true),
  ('in', 'Thu nhập khác', true),
  ('in', 'Hoàn lại chi phí', true),
  ('both', 'Góp vốn / Rút vốn', false)
) AS v(direction, name, pnl)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    REVOKE ALL ON public.cash_categories FROM slink_app;
    GRANT SELECT, INSERT, UPDATE ON public.cash_categories TO slink_app;
  END IF;
END;
$$;
