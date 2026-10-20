ALTER TABLE memberships
  ADD COLUMN warehouse_scope_mode text NOT NULL DEFAULT 'all'
    CHECK (warehouse_scope_mode IN ('all', 'selected')),
  ADD CONSTRAINT memberships_warehouse_scope_role_check
    CHECK (role = 'stockkeeper' OR warehouse_scope_mode = 'all');

CREATE TABLE membership_warehouse_scopes (
  store_id uuid NOT NULL,
  user_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id, warehouse_id),
  FOREIGN KEY (store_id, user_id) REFERENCES memberships (store_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (store_id, warehouse_id) REFERENCES warehouses (store_id, id) ON DELETE RESTRICT
);

CREATE INDEX membership_warehouse_scopes_warehouse_idx
  ON membership_warehouse_scopes (store_id, warehouse_id, user_id);

ALTER TABLE membership_warehouse_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_warehouse_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON membership_warehouse_scopes
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
