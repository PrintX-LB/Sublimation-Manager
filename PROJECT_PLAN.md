# PrintX Project Plan

## Overview

PrintX is a local single-computer administration application for a sublimation-printing business. It manages customers, products, orders, payments, stock, artwork and operational reporting.

## Current architecture

- Next.js App Router with TypeScript strict mode
- SQLite database with Prisma ORM and migrations
- Local file storage under `uploads/`
- Server Actions for mutations and server-side validation
- Tailwind CSS with the PrintX dark visual system
- Vitest and Playwright for automated checks

## Completed modules

- Customers and customer archiving
- Products, categories, variants and stock controls
- Orders, payments and status transitions
- Transactional stock commitment/restoration
- Local artwork uploads and print-ready exports
- Storage retention cleanup
- Admin Mode and secure test-order deletion
- Order Details production workspace
- Production Board Version 1
- Generated Print Sheet Library Version 1: searchable, paginated sheet records with slot traceability, lifecycle status, material-consumption visibility and safe printed/cancelled/recreation workflows
- Automatic Sheet Pairing Version 1: deterministic Ready to Print transfer queue, compatibility grouping, reviewed pair/one-slot generation and database-protected attempt assignment
- Automatic Sheet Pairing V1.1: historical assignment states, release/requeue recovery, regeneration transfer and temporary in-queue pair editing
- Consistent Workflow Navigation: reusable contextual back buttons, safe fallback routes and origin-aware return handling

## Frozen Artwork Editor Version 1

The Fabric.js artwork editor is frozen as Version 1. Only confirmed production bugs may change it. New editor features require a separate milestone and regression review.

## Production Board Version 1

The `/production` board groups active orders by production status, highlights urgency and deadlines, and reuses the existing status, payment, artwork and stock services.

## Production Incident Management

Production Incidents and Reprints Version 1 records failed production attempts without changing the customer-facing order quantity. An approved/in-production item can be marked damaged with a required reason and optional note. The operator must explicitly choose whether the blank was damaged/discarded or remains usable. The operation atomically marks the current attempt failed and creates a replacement attempt; only the damaged outcome consumes one additional blank through the existing stock movement transaction and increases the order's internal actual production cost. An idempotency key and unique database constraint make retries safe. Failed attempts and their linked stock movements remain available in order history. Paper, ink, heat tape and other material waste are recorded informationally until Inventory V2 adds consumable deductions.

## Inventory V2 Foundation

Inventory V2 adds one coherent inventory-item and immutable-inventory-transaction foundation for blank products and production supplies. Items support decimal-safe base units, minimum stock, unit cost, supplier and storage metadata. Existing product variants are backfilled as linked `BLANK_PRODUCT`/`PIECE` items without changing their stock quantities or historical movement records. Purchases use weighted-average unit cost; manual adjustments and waste create new transactions rather than editing history. Automatic production recipes and consumable deductions remain deferred.

Future Inventory V2 extensions include product production recipes, automatic consumable deduction, selectable consumable deductions during incidents, ink usage estimation, supplier management, purchase orders and batch/lot tracking.

## Production Recipes and Automatic Material Consumption

Production Recipes V1 defines staged material requirements per ProductVariant using the existing InventoryItem records. Recipe lines support descriptive material roles, required/optional behavior and stages for print-sheet generation, production start and completion. Consumption is recorded through the central inventory service and immutable `ProductionMaterialConsumption` records with idempotency keys. A physical A4 sheet consumes print media once even when it contains two transfers; V1 attributes the shared paper cost to the first slot. Blank-product allocation remains owned by the existing order workflow and is never deducted again by recipes. Incident waste may select configured recipe materials, while future work includes artwork-based ink estimation, recipe versions, packaging recipes, machine-specific recipes, purchase orders and lot tracking.

## Current roadmap

1. Revenue and Reports Version 1
2. Production workflow improvements
3. Operational quality and performance hardening
4. Optional future QR workflow
5. Freeform/variable-size nesting, roll-media optimization, printer queues and operator assignment

## PrintX Desktop Beta

- Electron wraps the existing self-hosted Next.js application; the browser workflow remains available.
- Desktop work is isolated on the `desktop-beta` branch.
- Writable SQLite, artwork, print sheets, backups, logs, configuration and temporary files live under the Windows user-data directory rather than inside the executable.
- First launch uses an empty database and applies production Prisma migrations; real data is imported only through the existing Backup & Restore workflow.
- Fresh desktop databases provide one-time Admin setup backed by a bcrypt password hash in application settings; no default or personal password is embedded in the package.
- Desktop session signing uses a randomly generated per-installation secret. Backups restore database-backed Admin credentials and invalidate the current Admin session after restore.
- The first distribution target is an unsigned Windows x64 portable executable. An NSIS installer, code signing and automatic updates remain follow-up work after portable verification.

## Deferred QR workflow

QR production tickets, scanner routes, QR tokens and barcode-printer integration are intentionally deferred. They must not be added until a future milestone is approved.

## Known limitations

- The application is currently designed for one local Windows user.
- Activity history is derived from existing records where a dedicated event is not available.
- Production Board drag-and-drop is not implemented.
- Revenue reports are estimates when based on stored production-cost snapshots.
- Existing print sheets created before the library migration may have no PS number; they remain viewable as legacy sheets. Missing-file recreation re-renders the two linked artwork versions, while physical regeneration creates a new traceable record and records staged material consumption through the recipe service.

## Production Workflow Optimization

- Queue and Production Board summaries use compact counters and denser cards so operators can scan more work without excessive scrolling.
- Production list queries select operational metadata and artwork-version dimensions only; full-resolution artwork remains reserved for previews and generation.
- Queue pair edits remain client-only until the operator explicitly generates a sheet, preserving draft safety and avoiding unnecessary database work.
- Sheet assignment history is retained while only ACTIVE assignments block pairing; release and regeneration operations are transactional and idempotent.
- Production board cards expose the active attempt and keep incident, artwork and payment actions available without duplicating their services.

## Cut Mark Improvements

- Print templates support None, Corner marks and Full outline modes.
- Corner marks use configurable physical millimetre length, offset and stroke thickness and are rendered per occupied transfer slot.
- Artwork remains mirrored independently; production marks, order numbers and strips remain readable and non-mirrored.
- Generated sheets snapshot their cut-mark settings so reopening, recreation and historical output do not depend on later template edits.

## Cross-Module QA and Stabilization

- End-to-end customer, order, artwork, payment and production workflows are reviewed together.
- Production sheet assignment, incident/reprint and recipe consumption paths are checked for idempotency and historical integrity.
- Test suites use isolated SQLite copies and mock Next cache invalidation outside a request context.
- Backup/restore validation includes checksums, staged SQLite loading, safety backups and storage remapping.
- Release readiness is tracked against the migration, storage, backup, workflow, test and build checks below.

### Release-readiness checklist

- [x] Apply all Prisma migrations to a clean database with `npm run verify:clean-install`; the check applies all migrations twice, verifies standard categories and exercises a customer/order relationship.
- [x] Create and verify a manual backup before desktop packaging (backup/restore unit coverage includes checksum and relationship checks).
- [x] Confirm configured order and sheet folders are writable and included in backup scope through the isolated storage settings used by verification scripts.
- [ ] Verify the complete customer/order/payment, production, reprint and sheet release workflows with disposable browser data (focused smoke coverage is present; the full data-driven workflow remains manual).
- [x] Run Prisma validation/generation, TypeScript, ESLint, unit tests and production build.
- [x] Run selected Playwright smoke workflows against an isolated database with `npm run test:e2e`.
- [x] Review known limitations and confirm no runtime data, secrets or generated files are staged.

### Release blockers

No release-blocking migration or startup issue remains for the local beta path. A clean SQLite database can be migrated and opened reproducibly, and the core production surfaces render against an isolated database.

### Non-blocking limitations

- The broad, data-heavy release/requeue, incident/reprint and backup/restore browser scenarios still require a longer manual run or dedicated fixtures; the automated suite intentionally keeps smoke data disposable.
- There is no desktop packaging, employee account system, batch sheet generation or QR ticket workflow yet.
- Revenue and production-cost reports remain estimates where historical snapshots are incomplete.

## Next milestone: Revenue and Reports

Build a server-aggregated financial dashboard with collected revenue, order value, outstanding balances, estimated profit, monthly trends, product/customer reports and CSV exports.
