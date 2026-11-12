# AoLinks working rules

AoLinks is a separate Rust automation engine mounted by Slink's Node/Fastify
backend, not a replacement for Slink's business backend. The management UI is
developed and served from Slink, not from this directory.

- Work only inside `AoLinks/` unless the user explicitly changes that boundary.
- Keep Slink as the source of truth for identity, store membership, permissions,
  and retail transactions. AoLinks may own only its `automation_*` tables.
- Never update Slink order, inventory, payment, cashbook, or customer-ledger
  tables directly. Future business actions must call approved Slink services.
- Keep execution in dry-run mode until an action type, authorization policy,
  idempotency behavior, and real acceptance tests are approved.
- Tests must use synthetic data, emit a readable report under `Logs/`, and
  distinguish unit evidence from Slink integration evidence.
- Do not write secrets, session tokens, customer payloads, or credentials to
  test or runtime logs.
- Do not claim Slink integration is active until the host mounts this module,
  applies its migration with the production migration process, and verifies it.
- Before adding an action or changing data ownership, ask the project owner.

Use the conventions and current scope in `README.md` and `docs/ARCHITECTURE.md`.
