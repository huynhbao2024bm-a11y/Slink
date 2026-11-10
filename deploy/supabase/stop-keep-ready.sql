-- Stop only this project's readiness job. Preserve diagnostics and other jobs.
BEGIN;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'slink-preview-healthcheck';
UPDATE slink_ops.preview_healthcheck SET enabled = false WHERE singleton;
COMMIT;
