# AoLinks architecture

## Purpose

Provide a reusable Rust rule-evaluation core compiled as a Node-API native
module and called inside Slink's existing Fastify process. This retains
Slink's session, tenant boundary, and database connection without a second
authentication service. The first deliverable is an observable, read-only
dry-run slice.

## Boundaries

1. **Rust core (`rust`)**: pure input validation and rule evaluation; no
   database, network, Slink imports, or side effects.
2. **Node bridge (`src/core`)**: loads the compiled addon and maps native
   validation errors to the host API contract.
3. **Host adapter (`src/http`)**: Fastify routes that receive the host's
   authentication, CSRF, store transaction, and database pool dependencies.
   The Slink host remains responsible for mounting the adapter.
4. **AoLinks persistence**: only `automation_*` tables. The current migration
   stores sanitized execution summaries, not workflow inputs or business data.
5. **Management UI**: implemented in Slink. It uses the active Slink browser
   session and CSRF cookie; it does not collect or store a second password or
   session.
6. **Logs**: test evidence is written to `Logs/test-runs/`; durable dry-run
   history belongs in `automation_runs`; `Logs/runtime-*.jsonl` mirrors only
   sanitized run metadata.

## Request flow

`Slink UI -> Fastify session/CSRF/store authorization -> Rust N-API evaluator
-> insert redacted automation_runs record -> commit -> return preview`

The core only compares input facts and returns a plan. The action plan contains
IDs/types, never executable code or arbitrary URLs. No real action registry is
enabled in this phase.

## Data/security decisions

- No direct writes to Slink sales, inventory, orders, payments, cashbook, or
  customer-ledger tables.
- Store scope is checked by Slink's `withStore` and reinforced by RLS on the
  AoLinks run table.
- Only `owner` and `manager` can request a dry-run.
- Request bodies are bounded; workflow paths reject prototype-related segments.
- Run summaries contain workflow ID/name, trigger type, condition outcomes,
  action IDs/types, actor, store, mode, and time. Raw event data and action
  parameters are omitted.
- Future real actions require an explicit domain-service adapter, permissions,
  idempotency key, retry policy, timeout, failure semantics, audit trail, and
  end-to-end acceptance tests before they can be enabled.

## Deliberate non-goals in this slice

- Building or editing the management UI.
- Persisting/editing/publishing workflow definitions.
- Schedules, webhook subscriptions, queue workers, retries, or background
  execution.
- Executing notifications, HTTP requests, emails, AI prompts, or retail actions.
- Production migration, deployment, Slink navigation, or changes outside this
  directory.

## Evidence required for actual Slink integration

The host must build the native addon for its deployment target, mount the route,
apply the migration with its privileged migration role, and verify
login/CSRF, owner/manager authorization, cross-store isolation, database
rollback, and browser behavior against an isolated Slink database. Unit tests
in this folder are not evidence that the Slink host has been integrated.
