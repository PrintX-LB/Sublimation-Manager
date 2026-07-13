# PrintX Coding Guidelines

- Preserve the existing Next.js, TypeScript, Prisma, SQLite and local-storage architecture.
- Do not modify the frozen Artwork Editor except to fix a confirmed bug.
- Reuse existing services and server-side validation.
- Never duplicate stock, payment or status-transition logic.
- Keep money calculations decimal-safe and use historical order snapshots.
- Run TypeScript, ESLint, unit tests, relevant Playwright tests and the production build.
- Never commit secrets, uploads, SQLite database files or `.env.local`.
- Keep UI consistent with the PrintX dark theme and accessible controls.
- Keep components focused and avoid premature abstraction.
- Report the exact files modified and remaining limitations.
