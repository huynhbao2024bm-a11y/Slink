CREATE TABLE order_internal_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX order_internal_notes_recent_idx
  ON order_internal_notes (store_id, order_id, id DESC);

CREATE TABLE order_tag_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tag text NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 32),
  tag_key text NOT NULL CHECK (length(tag_key) BETWEEN 1 AND 64),
  operation text NOT NULL CHECK (operation IN ('added', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT
);

CREATE INDEX order_tag_events_latest_idx
  ON order_tag_events (store_id, order_id, tag_key, id DESC);

ALTER TABLE order_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_internal_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON order_internal_notes
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

ALTER TABLE order_tag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tag_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON order_tag_events
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

CREATE TRIGGER order_internal_notes_append_only
  BEFORE UPDATE OR DELETE ON order_internal_notes
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TRIGGER order_tag_events_append_only
  BEFORE UPDATE OR DELETE ON order_tag_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.order_internal_notes FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.order_internal_notes TO slink_app';
    EXECUTE 'REVOKE ALL ON public.order_tag_events FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.order_tag_events TO slink_app';
  END IF;
END;
$$;
