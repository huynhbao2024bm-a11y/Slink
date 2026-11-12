# Copilot instructions for AoLinks

AoLinks is a reusable Rust automation engine compiled as a Node-API native
module and called by Slink's Node.js/Fastify backend. Its management UI belongs
to Slink and must not be implemented in this directory. AoLinks may later be
reused in other projects through explicit adapters; do not make those adapters
bypass a host application's authentication or authorization.

## Non-negotiable boundaries

- Make changes only under `AoLinks/` unless the user explicitly authorizes
  changes elsewhere.
- Treat Slink as the authority for users, sessions, stores, memberships,
  permissions, and business records.
- Store AoLinks-owned data only in `automation_*` tables. Do not write directly
  to Slink's sales, products, inventory, payment, cash, debt, or customer
  tables. Business effects must call explicitly approved Slink domain services.
- The default and only execution mode for the initial engine is `dry_run`.
  Evaluating a workflow must never invoke an external or business side effect.
- Never claim deep integration is active until Slink mounts the module, applies
  the migration, and passes end-to-end authorization and transaction tests.
- Ask the owner before introducing an action with real effects, changing
  ownership boundaries, adding external providers, or enabling automatic runs.

## Engineering requirements

- Keep core execution in Rust (`rust/`) and host/auth/database integration in a
  thin CommonJS adapter (`src/`). Keep the Rust engine pure.
- Match Slink's Fastify, PostgreSQL, and `node:test` conventions in the adapter.
- Validate all workflow and event inputs; use tenant-scoped transactions and
  server-side role checks. Never rely on hidden UI controls as authorization.
- Keep execution records minimal and redact event/action payloads from logs.
  Never log credentials, cookies, tokens, or customer data.
- Every behavior change needs focused tests for success, invalid input,
  authorization, tenant scope, duplicate/retry behavior where applicable, and
  failure handling.
- Run tests through `scripts/run-tests.ps1` so the result is captured under
  `Logs/`. Do not report a test as passed unless its recorded exit code is zero.
- Keep every change and test report inside `AoLinks/`. Commit only AoLinks
  paths; never include unrelated staged work.
- Final reports must briefly list changes, evidence/limitations, and the next
  step. Do not interrupt ongoing work with progress-only reports.

Read `README.md`, `docs/ARCHITECTURE.md`, and `docs/COMPETITOR_NOTES.md`
before changing the module.
