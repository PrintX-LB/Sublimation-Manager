# Repository storage notes

The repository audit on 18 July 2026 found two SQLite files under `data/` that are intentionally retained and are not referenced by the application runtime:

| File | Size | Contents | Recommendation |
| --- | ---: | --- | --- |
| `data/clean_existing.db` | 528 KB | Empty operational tables, five standard categories, one sequence row, and 27 migration records | Keep as a clean migration/fixture snapshot unless a future test harness replaces it. |
| `data/sublimation.db.bak` | 1.5 MB | Older backup containing one print template, one admin-audit row, and legacy category/sequence data | Keep as a historical backup; do not use as the active database or delete automatically. |

Neither file is included in the Electron package. The desktop application uses its per-user database under `%LOCALAPPDATA%\PrintX\database\printx.db`. The active development database remains `data/sublimation.db`.

Do not delete or overwrite these files as part of routine build cleanup. Any future removal should be an explicit, separately reviewed data-maintenance decision.
