CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  workflow_id text NOT NULL CHECK (length(workflow_id) BETWEEN 1 AND 80),
  workflow_name text NOT NULL CHECK (length(workflow_name) BETWEEN 1 AND 120),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 80),
  mode text NOT NULL CHECK (mode = 'dry_run'),
  status text NOT NULL CHECK (status IN ('matched', 'not_matched')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX automation_runs_store_created_idx
  ON automation_runs (store_id, created_at DESC, id DESC);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_scope ON automation_runs
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slink_app') THEN
    GRANT SELECT, INSERT ON public.automation_runs TO slink_app;
  END IF;
END
$$;
