CREATE INDEX audit_events_store_recent_idx
  ON audit_events (store_id, occurred_at DESC, id DESC);
