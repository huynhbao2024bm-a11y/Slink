CREATE TABLE customer_tag_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tag text NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 32),
  tag_key text NOT NULL CHECK (length(tag_key) BETWEEN 1 AND 64),
  operation text NOT NULL CHECK (operation IN ('added', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX customer_tag_events_latest_idx
  ON customer_tag_events (store_id, customer_id, tag_key, id DESC);

CREATE INDEX customer_tag_events_active_lookup_idx
  ON customer_tag_events (store_id, tag_key, customer_id, id DESC);

ALTER TABLE customer_tag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tag_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON customer_tag_events
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

CREATE TRIGGER customer_tag_events_append_only
  BEFORE UPDATE OR DELETE ON customer_tag_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.customer_tag_events FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app';
    EXECUTE 'REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.customer_tag_events_id_seq TO slink_app';
  END IF;
END;
$$;
