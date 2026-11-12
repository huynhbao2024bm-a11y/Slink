# AoLinks logs

- `test-runs/*.txt`: complete test-run output and exit code, produced by
  `scripts/run-tests.ps1`, including Rust unit tests, native addon build, and
  Node/Fastify adapter tests.
- `runtime-YYYY-MM-DD.jsonl`: sanitized runtime dry-run records. The API
  transaction fails explicitly if the local activity log cannot be written.
- Durable dry-run summaries: the `automation_runs` table after the host applies
  the migration and mounts AoLinks.

Never save credentials, cookies, tokens, customer payloads, or production
exports here. Use synthetic fixtures for tests. Keep generated evidence
human-readable and include it in the AoLinks-only commit when the task requires
Git persistence.
