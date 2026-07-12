# PrintFlow — Phase 1

Production-oriented foundation for a small sublimation-printing business administration application. Phase 1 provides authentication, a protected responsive admin shell, database structure, storage policies, seed data, and test infrastructure. Operational CRUD and artwork workflows are intentionally placeholders.

## Stack

- Next.js App Router, React and strict TypeScript
- Tailwind CSS
- Supabase PostgreSQL, Auth and Storage
- Zod validation
- Vitest, Testing Library and Playwright
- ESLint and Prettier

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project, or the Supabase CLI and Docker for local development

## Installation

```bash
npm install
cp .env.example .env.local
```

On PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env.local
```

Set both values in `.env.local` using the Project URL and publishable/anon key from Supabase **Project Settings → API**. Never put the service-role key in this application.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase setup

### Hosted project

1. Link the CLI: `npx supabase login`, then `npx supabase link --project-ref YOUR_PROJECT_REF`.
2. Apply migrations: `npx supabase db push`.
3. Seed sample business data: `npx supabase db execute --file supabase/seed.sql` (or paste the seed into the SQL editor).
4. In **Authentication → Users**, create the first email/password user. The database trigger creates its active profile automatically.

If users existed before the migration, create their `profiles` rows manually in the SQL editor. The private `order-files` storage bucket and its 20 MB/type restrictions are created by the migration.

### Local Supabase

```bash
npx supabase start
npx supabase db reset
```

`db reset` applies `supabase/migrations` and then `supabase/seed.sql`. Copy the local API URL and anon key printed by `supabase status` into `.env.local`.

## Running

```bash
npm run dev
```

Open <http://localhost:3000>. Unauthenticated requests are redirected to `/login`; successful email/password authentication opens `/dashboard`.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Playwright tests the sign-in experience and unauthenticated route protection in desktop and mobile Chromium. With no environment configured, the test server uses a deliberately unreachable local Supabase URL; this is sufficient for unauthenticated checks and does not bypass authentication.

## Architecture and security

- `src/app/(auth)` contains public authentication UI and server actions.
- `src/app/(admin)` is protected both by middleware and a server-layout user check.
- `src/lib/supabase` separates browser, server and middleware Supabase clients.
- `src/lib/validation` holds boundary schemas; future database access and business rules should remain outside UI components.
- Money is stored as PostgreSQL `numeric(12,2)`. Future TypeScript code must transport monetary values as decimal strings or use a decimal library—never JavaScript floating-point arithmetic.
- Every business table has RLS enabled. Policies grant access only to authenticated users with an active `profiles` row; `anon` receives no policies. The storage bucket is private and uses the same active-user gate.
- The current schema represents one company workspace. Multi-company tenancy is not part of Phase 1.

## Phase 1 boundaries

Not implemented yet: customer/product CRUD, order creation, inventory deductions, payments UI, file upload UI, artwork editing, reporting, invitations, password reset and role-management screens. The underlying schema is prepared for these future phases without exposing incomplete workflows.
