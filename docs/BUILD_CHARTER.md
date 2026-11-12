# Slink — Build charter

## Approved UI direction update (2026-11-02)

The user explicitly authorized a complete interface and workflow redesign, prioritizing very simple daily work with few actions. This supersedes earlier instructions to retain the old interface. Use KiotViet and Sapo public workflows as references; separate owner management from a compact cashier POS and stock/accounting workspaces. The tea-shop example illustrates role separation, not an exclusive vertical. Existing transaction, authorization, persistence and release-evidence requirements remain applicable. See UX_REDESIGN_20261102.md.


**Purpose:** Keep every implementation decision pointed at the product the user asked for. This is the source of truth for scope and completion. Read it before changing code and update it only when the user changes the goal or verified evidence changes what is possible.

## User’s end goal

Build **Slink**, a sales and operations product that can be delivered to customers and used for real business operations. The current target is independent modern shops and small selling teams across fashion, cosmetics/personal care, cafés/F&B, online sellers, and hybrid sales. Traditional grocery shops are no longer the default customer, and large supermarkets/chains are not the initial target. The first vertical is still unvalidated. It must work on iOS and Android 10+ and retain the interface and design direction the user has approved.

“Complete” means a customer can onboard a real store, enter or import its catalog, sell and refund goods, track inventory and money accurately, use the product from supported phones, recover data, and get dependable support. A prototype, attractive interface, local demo, or list of planned integrations does not meet this goal.

## Product promise

Help a Vietnamese independent shop or small selling team start quickly, finish daily work with less repeated entry, and see how every sale, stock movement, and payment was recorded:

- sell in store and record every payment;
- know what is in stock, what moved, and why;
- track customers, suppliers, receivables, and payables;
- reconcile sales, cash, returns, and expenses;
- retrieve trustworthy reports and records;
- continue operating safely when connectivity is interrupted and reconcile later, only after durable offline behavior is implemented and verified.

VND, Vietnamese language, local dates, and Vietnamese business workflows are defaults. The product must separate store business profile, the user's job, server-enforced permissions, and a POS/device mode. A profile may simplify navigation; it does not establish that the associated vertical workflow exists. Choose the launch vertical from field evidence, not from a source-code comparison alone.

## User-requested product expansion (2026-10-15)

The user has expanded Slink's target scope to include omnichannel commerce operations: multi-marketplace and website connections; product information and channel listings; a shared order workflow; multi-warehouse inventory; carrier fulfillment and COD reconciliation; marketplace finance; CRM, analytics, automation, third-party integrations, security administration, and employee/task utilities. The exact source is [`USER_FEATURE_INVENTORY.md`](USER_FEATURE_INVENTORY.md); the gap comparison and phased scope are in [`MULTICHANNEL_SCOPE.md`](MULTICHANNEL_SCOPE.md).

This expansion is a staged product roadmap, not evidence that these modules exist or a reason to weaken the current retail release gates. Each connector requires a real partner app, granted scopes, credentials, webhook/TLS configuration, and end-to-end reconciliation. Prioritize a reliable core and deliver one marketplace/carrier vertical slice at a time; never show a connection or sync as successful without provider confirmation.

## Customer-direction update (2026-10-31)

The user clarified that the product should focus on modern independent sellers and small teams rather than treating traditional grocery as the default. The candidate groups are cafés/F&B, fashion, cosmetics/personal care, online sellers, and hybrid shops. No opening segment or first vertical has been selected. The product strategy is low-friction onboarding and task-focused workflows with complete operational and financial traceability, not maximum menu count. See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`TARGET_CUSTOMER_WORKFLOWS.md`](TARGET_CUSTOMER_WORKFLOWS.md). This direction does not remove unfinished capabilities; it changes their order and requires validation before committing to a vertical.

## Non-negotiable product rules

1. **Persist real business data.** Durable storage, restore, migration, and cross-device access must be designed for customer records. Browser `localStorage` is not the system of record.
2. **Protect transaction integrity.** A sale, payment, refund, stock movement, purchase, or debt settlement either records all related changes or records none. Every operation needs a stable identifier and audit trail.
3. **Use ledgers as the source of truth.** Orders and their lines, payments/refunds, inventory movements, purchases, receivables/payables, and cash movements must be traceable. Reports must be derived from those records, never hard-coded sample totals.
4. **Enforce store boundaries and roles.** An authenticated user can access only stores and actions they are authorized to use. Server-side checks are mandatory; hiding a button is not authorization.
5. **Be explicit about money and stock.** Persist money in integer VND. Define rounding, tax, discount, tendered amount, change, partial payment, refund, and debt rules. Stock cannot go negative unless a store explicitly enables that policy.
6. **Handle unreliable connectivity.** The user sees whether a change is saved locally, synchronized, pending, or failed. Conflicts never silently overwrite a sale or stock count.
7. **Work on supported mobile devices.** Touch targets, safe areas, small viewport layout, printing/sharing where supported, installation, and keyboard/barcode input must be verified on real devices or representative browser/device automation.
8. **Protect customer trust.** Backups, restore, privacy, retention, incident handling, monitoring, and support are part of the product, not afterthoughts.
9. **Integrate honestly.** Payment, e-invoice, shipping, accounting, and subscription actions may be called complete only after a real provider integration is configured and verified end to end. A selected payment method is not a payment transaction.
10. **Preserve the accepted design.** Keep the current Slink visual language; change it only to improve real task completion, accessibility, or platform fit.

## Required capabilities before customer delivery

### Store setup and access

- Secure registration, sign-in, session lifecycle, password recovery, store creation, staff invitation, role/permission assignment, and account/store separation.
- A store-scoped, searchable business activity journal for authorized owners/managers; security login/session events remain a separate required control.
- Safe onboarding/import of products, opening inventory, customers, suppliers, and balances. Clearly distinguish demo/sample data from the customer’s records.

### Sales and money

- Product search by name/SKU/barcode; cart quantity and price checks; discounts; customer; split or partial tender; cash change; debt; receipt; cancellation/void rules; and idempotent submission.
- Partial and full returns by line and quantity, bounded by quantities sold less prior returns. Record refund method and amount, stock disposition, customer debt/loyalty adjustments, reason, actor, and time.
- Cashbook, daily shift/cash reconciliation, refunds, expenses, receivables, supplier payables, and settlements that reconcile to the underlying ledgers.

### Products and inventory

- Catalog, variants/units, SKU/barcode, tax and price rules, cost history, thresholds, receiving/purchase records, counts, adjustments, stock transfers where supported, reservations where needed, and movement history.
- Concurrency-safe stock checks and recording; a sale on one device cannot be silently lost or oversell because another device changed stock.

### Records, reports, and recovery

- Searchable order and customer histories, printable/shareable receipts, accurate date-range reports, CSV/PDF export, scheduled backups, restore drills, and account/data export/delete processes.
- Reports identify their time zone, refund/void treatment, tax treatment, and gross/net definitions.

### Platform and operations

- Installable iOS/Android experience with documented supported browser/OS versions, offline/sync behavior, accessibility review, release/update path, error reporting, health monitoring, incident response, and customer support.
- Production hosting with TLS, secrets management, least privilege, database migrations, backups, retention, monitoring, rate limits, abuse controls, and a rollback/recovery procedure.
- Before enabling regulated workflows, verify current Vietnamese requirements with authoritative sources and the selected provider. Do not infer legal compliance from UI or a generic receipt.

## Release gates — all must pass

Slink must not be called customer-ready until each gate has concrete evidence recorded in `docs/DELIVERY_ROADMAP.md`:

1. **Business correctness:** sale → payment → stock → customer debt/cashbook → report, return/refund, purchase → payable → settlement, and inventory count flows pass with boundary cases and no duplicate/lost records.
2. **Data safety:** persistence across reload, sign-out, another device, restart, migration, backup/restore, and simulated service interruption is demonstrated.
3. **Security/privacy:** authentication, authorization, tenant isolation, input validation, secrets, transport, personal-data handling, and security review pass.
4. **Platform:** iOS and Android 10+ representative devices can install/use core workflows; accessibility and mobile layout are reviewed.
5. **Integrations:** each advertised provider flow completes in its real sandbox/production-approved environment and failure paths reconcile correctly. Unsupported integrations are not advertised.
6. **Operations:** production deployment, monitoring, backup/restore, recovery, support, privacy/terms, pricing/subscription behavior, and release/rollback procedures are ready.
7. **Customer acceptance:** a real retailer can complete onboarding and daily operations with realistic data without developer intervention; documented acceptance evidence is retained.

## Boundaries and dependencies

Code and documentation can be built in this workspace. Real cloud deployment, production payment collection, e-invoice issuance, legal commitments, app store publication, and live customer-data processing depend on provider accounts, credentials, approved terms, and/or user-authorized external changes. Record the exact dependency and continue all independent work; do not fabricate these resources.

## Current implementation is not completion evidence

The repository contains a PWA shell and server-backed workflows; Render and Supabase have also been configured and a Render deployment is live. These facts do not establish that every workflow is accepted or customer-ready. The latest observed deployment, application migration ledger, security advisory, and remaining evidence are recorded in [`DELIVERY_ROADMAP.md`](DELIVERY_ROADMAP.md). Until every release gate has evidence, describe Slink as in progress and be precise about which flows are real, operator-confirmed, or unavailable.
