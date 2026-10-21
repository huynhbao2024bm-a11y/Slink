CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(code) BETWEEN 3 AND 32),
  code_normalized text NOT NULL CHECK (code_normalized ~ '^[A-Z0-9_-]{3,32}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
  discount_amount_vnd bigint,
  discount_basis_points integer,
  minimum_subtotal_vnd bigint NOT NULL DEFAULT 0 CHECK (minimum_subtotal_vnd >= 0),
  maximum_discount_vnd bigint CHECK (maximum_discount_vnd IS NULL OR maximum_discount_vnd > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_customer_limit integer CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  UNIQUE (store_id, code_normalized),
  CHECK ((discount_type = 'fixed' AND discount_amount_vnd IS NOT NULL AND discount_amount_vnd > 0 AND discount_basis_points IS NULL)
      OR (discount_type = 'percent' AND discount_basis_points IS NOT NULL AND discount_basis_points BETWEEN 1 AND 10000 AND discount_amount_vnd IS NULL)),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX promotions_store_active_idx ON promotions (store_id, is_active, updated_at DESC, id);

CREATE TABLE promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  promotion_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid,
  cashier_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code_snapshot text NOT NULL,
  discount_vnd bigint NOT NULL CHECK (discount_vnd > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, order_id),
  FOREIGN KEY (store_id, promotion_id) REFERENCES promotions(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX promotion_redemptions_customer_idx ON promotion_redemptions (store_id, promotion_id, customer_id, created_at DESC);
CREATE INDEX promotion_redemptions_promotion_idx ON promotion_redemptions (store_id, promotion_id, created_at DESC);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON promotions
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON promotion_redemptions
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.promotions FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON public.promotions TO slink_app';
    EXECUTE 'REVOKE ALL ON public.promotion_redemptions FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.promotion_redemptions TO slink_app';
  END IF;
END;
$$;
