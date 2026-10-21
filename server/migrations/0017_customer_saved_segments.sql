CREATE TABLE customer_saved_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 48),
  name_key text NOT NULL CHECK (length(name_key) BETWEEN 1 AND 96),
  segment_key text CHECK (segment_key IN ('no_purchase', 'repeat', 'owing', 'inactive90')),
  tag_label text,
  tag_key text,
  min_spent_vnd bigint CHECK (min_spent_vnd >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, id),
  CHECK ((tag_label IS NULL) = (tag_key IS NULL)),
  CHECK (tag_label IS NULL OR length(trim(tag_label)) BETWEEN 1 AND 32),
  CHECK (tag_key IS NULL OR length(tag_key) BETWEEN 1 AND 64),
  CHECK (segment_key IS NOT NULL OR tag_key IS NOT NULL OR min_spent_vnd IS NOT NULL)
);

CREATE UNIQUE INDEX customer_saved_segments_name_idx
  ON customer_saved_segments (store_id, name_key);
CREATE INDEX customer_saved_segments_store_recent_idx
  ON customer_saved_segments (store_id, updated_at DESC, id);

ALTER TABLE customer_saved_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_saved_segments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON customer_saved_segments
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE ALL ON public.customer_saved_segments FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_segments TO slink_app';
  END IF;
END;
$$;
