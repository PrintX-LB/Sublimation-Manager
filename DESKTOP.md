# PrintX Desktop Beta

PrintX Desktop is an Electron shell around the existing Next.js, Prisma, and SQLite application. It is an additional deployment surface: normal browser development with `npm run dev` and `tools/Start PrintX.bat` remains supported.

## Commands

```powershell
npm run desktop:dev
npm run desktop:pack
npm run desktop:portable
npm run desktop:dist
```

- `desktop:dev` launches Electron and a Next.js development server.
- `desktop:pack` creates `release/win-unpacked` for local inspection.
- `desktop:portable` creates an unsigned x64 portable executable.
- `desktop:dist` creates portable and NSIS artifacts; use it only after the portable build passes verification.

## Runtime data

The packaged app resolves its writable data root from Electron's user-data path, set to `%LOCALAPPDATA%\PrintX` on Windows:

```text
PrintX/
  database/printx.db
  storage/orders/
  storage/print-sheets/
  storage/attachments/
  backups/
  logs/
  config/
  temp/
```

The executable never uses the development or test database. The repository's `data/`, `uploads/`, `print-sheets/`, backups, logs, `.env` files, and customer assets are excluded from desktop artifacts.

For isolated testing, set `PRINTX_DESKTOP_USER_DATA` before launching the packaged executable. This redirects every writable desktop path to a disposable directory.

## Startup and migrations

On first launch, Electron creates the runtime directories and an empty SQLite file, then runs `prisma migrate deploy` using the packaged schema and migration history. Before migrating a non-empty database to a new application version, it creates a database safety copy in `backups/`. Migration reset, `db push`, and development migrations are never run by the desktop application.

The Electron main process starts the packaged standalone Next.js server on an available loopback port, waits for `/dashboard`, and then opens the application window. Closing the final window shuts down the local server.

## Security

- Renderer Node integration is disabled.
- Context isolation and the Chromium sandbox are enabled.
- The preload bridge exposes only folder selection, approved path opening, version/data-path reads, logs, and restart.
- Navigation is limited to the loopback PrintX origin; approved HTTPS links open in the system browser.
- Permission requests are denied by default.

## Portable verification

Always use a disposable profile first:

1. Set `PRINTX_DESKTOP_USER_DATA` to a new temporary folder.
2. Launch the portable executable.
3. Confirm the empty database migrates and Dashboard opens.
4. Create disposable customer, order, inventory, and sheet data.
5. Close and reopen PrintX; confirm persistence.
6. Create and restore a disposable backup.
7. Confirm no writable files appear beside the executable or under application resources.
8. Remove the disposable folder only after PrintX is closed.

Unsigned beta builds may trigger Windows SmartScreen. Do not bypass SmartScreen programmatically. Code signing and updates are future release work.
