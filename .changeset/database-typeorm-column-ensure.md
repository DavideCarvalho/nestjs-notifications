---
"@dudousxd/nestjs-notifications-database-typeorm": minor
---

Non-destructive column-ensure: `ensureNotificationsTable` now adds columns missing from an existing table (not just creating absent tables), via `TableUtils.createTableColumnOptions`. A NOT-NULL-no-default column on a populated table is skipped with a clear warning instead of throwing.
