-- Hosting operation, run by the Supabase project owner independently of app migrations.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS slink_ops;
REVOKE ALL ON SCHEMA slink_ops FROM PUBLIC, anon, authenticated, slink_app, slink_migrator;

CREATE TABLE IF NOT EXISTS slink_ops.preview_healthcheck (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT true,
  pending_request_id bigint,
  requested_at timestamptz,
  completed_at timestamptz,
  last_http_status integer,
  last_ready boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0)
);
ALTER TABLE slink_ops.preview_healthcheck ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON slink_ops.preview_healthcheck FROM PUBLIC, anon, authenticated, slink_app, slink_migrator;
INSERT INTO slink_ops.preview_healthcheck(singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION slink_ops.run_preview_healthcheck(enqueue boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $health$
DECLARE
  saved slink_ops.preview_healthcheck%ROWTYPE;
  response record;
  ready boolean;
BEGIN
  SELECT * INTO STRICT saved FROM slink_ops.preview_healthcheck WHERE singleton FOR UPDATE;
  IF saved.pending_request_id IS NOT NULL THEN
    SELECT status_code, timed_out, content, created INTO response
      FROM net._http_response WHERE id = saved.pending_request_id;
    IF FOUND THEN
      BEGIN
        ready := coalesce(response.status_code = 200 AND NOT response.timed_out
          AND (response.content::jsonb ->> 'status') = 'ready', false);
      EXCEPTION WHEN invalid_text_representation THEN ready := false;
      END;
      UPDATE slink_ops.preview_healthcheck SET pending_request_id = NULL,
        completed_at = response.created, last_http_status = response.status_code,
        last_ready = ready,
        consecutive_failures = CASE WHEN ready THEN 0 ELSE least(consecutive_failures + 1, 1000000) END
        WHERE singleton;
    ELSIF saved.requested_at < now() - interval '2 minutes' THEN
      UPDATE slink_ops.preview_healthcheck SET pending_request_id = NULL,
        completed_at = now(), last_http_status = NULL, last_ready = false,
        consecutive_failures = least(consecutive_failures + 1, 1000000) WHERE singleton;
    END IF;
  END IF;
  SELECT * INTO STRICT saved FROM slink_ops.preview_healthcheck WHERE singleton;
  IF enqueue AND saved.enabled AND saved.pending_request_id IS NULL
      AND (saved.requested_at IS NULL OR saved.requested_at < now() - interval '4 minutes') THEN
    UPDATE slink_ops.preview_healthcheck SET
      pending_request_id = net.http_get(
        url := 'https://slink-xny3.onrender.com/api/ready',
        headers := '{"Accept":"application/json","User-Agent":"Slink-Readiness/1"}'::jsonb,
        timeout_milliseconds := 90000), requested_at = now() WHERE singleton;
  END IF;
  DELETE FROM cron.job_run_details WHERE ctid IN (
    SELECT detail.ctid FROM cron.job_run_details detail JOIN cron.job job ON job.jobid = detail.jobid
    WHERE job.jobname = 'slink-preview-healthcheck' AND detail.status IN ('succeeded', 'failed')
      AND detail.end_time < now() - interval '7 days' ORDER BY detail.end_time LIMIT 2000
  );
  RETURN (SELECT jsonb_build_object('enabled', enabled, 'pending', pending_request_id IS NOT NULL,
    'requestedAt', requested_at, 'completedAt', completed_at, 'httpStatus', last_http_status,
    'ready', last_ready, 'failures', consecutive_failures) FROM slink_ops.preview_healthcheck WHERE singleton);
END;
$health$;
REVOKE ALL ON FUNCTION slink_ops.run_preview_healthcheck(boolean) FROM PUBLIC, anon, authenticated, slink_app, slink_migrator;
SELECT cron.schedule('slink-preview-healthcheck', '*/5 * * * *', 'SELECT slink_ops.run_preview_healthcheck();');
