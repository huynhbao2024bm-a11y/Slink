# Automation system design references

Research was limited to public official documentation. These references inform
concepts only; AoLinks does not copy their code, branding, or product text.

## n8n

The official execution documentation distinguishes manual runs from
production runs, keeps workflow-level and instance-wide execution history, and
describes redacting execution input/output while retaining status and timing.

Source: [Understand executions](https://docs.n8n.io/build/understand-workflows/understand-executions/)

**AoLinks implication:** keep test/dry-run distinct from active execution,
provide a searchable run history, and redact payloads by default.

## Temporal

The official workflow guide describes workflow definitions and individual
executions, ordered event history, replay, and isolating external effects in
activities rather than replaying them as part of deterministic workflow logic.

Source: [Temporal Workflows](https://docs.temporal.io/workflows)

**AoLinks implication:** keep the rule evaluator deterministic and pure; route
future side effects through explicit host/provider adapters and persist
execution outcomes. Temporal's durable replay model is substantially more
capable than this initial module and must not be implied by the current code.

## Scope decisions

- Start with a pure evaluator, explicit dry-run mode, role/store checks, and
  redacted execution records.
- Keep Slink's existing Node/Fastify process as the authenticated host and use
  Rust through Node-API for the rule engine; this avoids a second session
  system or an extra network hop for the first slice.
- Do not add queue infrastructure or promise durable background workflows
  before a real workload and reliability target are known.
- Do not enable auto-run, arbitrary code, or unrestricted HTTP actions by
  default.
- Validate product needs with the owner before selecting the first real
  workflow or provider integration.
