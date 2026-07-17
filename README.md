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

## Quick Start (Windows)

1. Clone the repository.
2. Run `npm install` once from the repository directory.
3. Double-click `tools\Start PrintX.bat`.
4. PrintX prepares the local database, starts the development server and opens <http://localhost:3000> automatically.

The launcher determines the project directory from its own location, so it continues to work if the repository is moved or cloned into a different folder. It creates `.env` from `.env.example` only when `.env` does not already exist, prepares the default SQLite file and applies pending migrations without overwriting existing local configuration or data. Keep the launcher terminal open while using PrintX and press `Ctrl+C` there to stop the server.

## Desktop Beta (Windows)

Desktop packaging lives on the `desktop-beta` branch and does not replace browser development. The portable build wraps the same Next.js application in a secure Electron window and stores all writable data under `%LOCALAPPDATA%\PrintX`, outside the executable and application resources.

```powershell
npm run desktop:dev
npm run desktop:pack
npm run desktop:portable
```

`desktop:portable` produces an unsigned x64 beta executable under `release/`. The first packaged launch creates an empty SQLite database, applies the checked-in Prisma migrations, and creates isolated storage, backup, log, configuration, and temporary directories. Settings then provides a one-time Admin username/password setup; only the password hash is stored. It never packages the repository database, artwork, generated sheets, backups, credentials, or `.env` files. See `DESKTOP.md` for the data layout and testing procedure.

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
