# PrintX — local Phase 3

A local-first administration application for a single-user sublimation-printing business. Phase 3 adds orders, payments, local order files, and transactional SQLite stock control to the customer/product foundation.

## Stack

- Next.js App Router, React and strict TypeScript
- Tailwind CSS
- SQLite with Prisma ORM
- Vitest, Testing Library and Playwright
- ESLint and Prettier

## Requirements

- Node.js 20 or newer
- npm

No external account or hosted database is required. Prisma does require a local `DATABASE_URL`.

## Setup

From the repository directory:

```powershell
npm install
npx prisma migrate dev
npm run dev
```

Before the first Prisma command, create the root `.env` file without overwriting an existing one:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

The checked-in `.env.example` points at the existing local database (`data/sublimation.db`) so development does not reset or replace your current data. Keep any existing `DATABASE_URL` in `.env`; never commit `.env`.

Open <http://localhost:3000>. The root route opens the administration dashboard directly.

`npx prisma migrate dev` applies migrations and generates the Prisma client using the path in `.env`. The default is `data/sublimation.db`; the database file is excluded from Git. Prisma resolves relative SQLite URLs from `prisma/schema.prisma`, so `file:../data/sublimation.db` resolves to the repository's `data/sublimation.db`.

## Local database

The Prisma schema is in `prisma/schema.prisma`. It models:

- customers
- product categories
- print templates
- products and product variants
- orders and order items
- payments
- stock movements

Money uses Prisma `Decimal`; application code must not perform monetary calculations with JavaScript floating-point numbers.

Useful commands:

```powershell
npx prisma migrate dev --name describe_your_change
npx prisma generate
npx prisma studio
```

The order/stock migration is `prisma/migrations/20260712133000_orders_transactional_stock`. It adds order numbers and snapshots, payment and file metadata, status/discount fields, and immutable stock movement before/after values.

Create a migration whenever the Prisma schema changes. Do not edit an already-applied migration.

## Local files

Uploaded customer images, artwork, and template files belong under `uploads/`, not inside SQLite. The database stores only relative paths such as `uploads/customers/<generated-name>.png`.

`src/lib/files/local-file-storage.ts` creates collision-resistant filenames and writes files under an allowed upload category. The contents of `uploads/` are excluded from Git. Back up both `data/sublimation.db` and `uploads/` together because database paths refer to those files.

## Architecture

- `src/app/(admin)` contains the administration routes and intentionally has no authentication guard.
- `src/lib/db/prisma.ts` owns the singleton Prisma client used by future repositories and server-side business logic.
- `src/lib/files` owns local file persistence. UI components should store only the returned relative path.
- `src/lib/repositories` owns paginated database reads and domain persistence.
- `src/lib/validation` validates all browser input on the server before repository calls.
- Server actions coordinate validation, persistence, cache revalidation and user-facing errors. UI components do not access SQLite directly.

Authentication is deliberately absent for the initial single-PC deployment. The admin route group and data-access boundary allow a future authentication guard to be added without rewriting domain code.

## Quality checks

```powershell
npx prisma validate
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

## Customer and product management

- Customers support generated numbers, search, sorting, pagination, full contact/address details, editing, order-history placeholders and archival.
- Products support categories, multiple variant SKUs, selling price, production cost, stock visibility, low-stock thresholds, stock consumption, print-template selection and archival.
- Profit and margin calculations use integer cents rather than JavaScript floating-point arithmetic.
- Archival keeps records available for future order references; there is no permanent-delete workflow.

## Orders and stock

- Draft orders do not affect stock. Transitioning to `Approved` commits each item’s `stockPerUnit × quantity` inside one Prisma interactive transaction.
- Approval is idempotent through `Order.stockCommitted`; cancellation restores exactly the committed quantity.
- Approved quantity changes apply only the difference and create a movement row for the adjustment.
- SQLite writes are serialized by the transaction; conditional `updateMany` updates prevent a negative stock result when approvals race.
- Every order movement records the actual signed stock change, before/after values, reason, order and item references, and timestamp.
- Payments are separate records and payment state is calculated from their decimal amounts versus the order total.
- Local order files accept JPEG, PNG, WebP and PDF up to 20 MB and are stored under `uploads/`; only metadata and relative paths are persisted in SQLite.

## Current limitations

Phase 3 does not implement artwork editing, reporting, archived-record restoration, or authentication. SQLite is intended for one application process on one PC; a future multi-user or networked deployment will require a server database and authentication. Manual stock corrections currently expose a local single-user action and do not provide a separate administrator role/override UI.
