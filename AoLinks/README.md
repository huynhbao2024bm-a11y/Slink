# AoLinks

AoLinks is Slink's separately owned automation subsystem. Its rule engine is
written in Rust and exposed to Slink's existing Node.js/Fastify process through
a Node-API native module. The thin Slink adapter shares the database
connection, authenticated session, and store boundary. The management UI is
developed and served by Slink, not AoLinks.

The initial slice is deliberately limited to a generic workflow evaluator and
a **dry-run** API. It validates a workflow against a sample event, returns
which declared actions would be selected, and records a redacted run summary.
It does not execute actions or mutate Slink business data.

## Current integration state

The module is **not mounted by Slink yet**. This checkout is restricted to
changes inside `AoLinks/`, so Slink's `server/index.js`, migration runner, and
navigation are untouched. The integration contract is provided by `src/http/register.js`; its host must
build the Rust addon and pass Slink's existing `pool`, `authenticate`,
`requireCsrf`, and `withStore` functions.

Before enabling it in Slink:

1. Review the adapter and permission policy with the product owner.
2. Apply `migrations/001_aolinks_run_log.sql` through Slink's reviewed
   migration/release process; do not apply it directly to production.
3. Build and verify the Rust Node-API addon for Slink's Node/OS architecture.
4. Mount `registerAoLinksRoutes` in the Slink Fastify process.
5. Link AoLinks from Slink's authenticated management UI.
6. Verify session, CSRF, role, tenant-isolation, migration, and runtime behavior
   in an isolated Slink environment before any deployment.

## Development

Requirements: Slink's Node.js version, Rust stable toolchain, and Cargo. From
this directory:

```powershell
.\scripts\build-native.ps1
node --test
```

Preferred test command captures the full output and exit status in
`Logs/test-runs/`:

```powershell
.\scripts\run-tests.ps1
```

Tests use synthetic data and do not connect to Slink or a production database.

## Workflow draft shape

```json
{
  "id": "sample-follow-up",
  "name": "Sample follow-up",
  "trigger": { "type": "order.created" },
  "conditions": [
    { "path": "data.totalVnd", "operator": "greater_than", "value": 0 }
  ],
  "actions": [
    { "id": "notify-owner", "type": "notification.preview" }
  ]
}
```

The event has `type` and a JSON `data` object. Conditions are evaluated by the
Rust engine with type-safe comparisons. A matched dry-run returns action
IDs/types only; it never runs the action implementation.

## Logs and data

- `Logs/test-runs/` contains sanitized test reports for review and Git history.
- `Logs/runtime-*.jsonl` contains the sanitized local activity-log mirror.
- Runtime execution summaries are stored in the AoLinks-owned
  `automation_runs` table. The file mirror contains only run ID, workflow ID,
  status, mode, and time.
- Event bodies and action parameters are not persisted in run summaries.
- Do not put credentials, session material, customer payloads, or production
  exports in `Logs/`.

## Project-agnostic design

The core evaluator has no Slink imports. HTTP integration is an adapter that
receives authentication, CSRF, and tenant-scoped transaction functions from its
host. Reuse in another project requires that project's explicit adapters and
its own tenant/permission model; it is not safe to reuse Slink credentials or
database assumptions.
