CREATE TABLE user_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'login_succeeded', 'login_failed', 'email_verified', 'logout', 'password_changed', 'session_revoked'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_security_events_recent_idx
  ON user_security_events (user_id, occurred_at DESC, id DESC);

ALTER TABLE user_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY account_scope ON user_security_events
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'slink_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app';
    EXECUTE 'GRANT SELECT, INSERT ON public.user_security_events TO slink_app';
  END IF;
END;
$$;
