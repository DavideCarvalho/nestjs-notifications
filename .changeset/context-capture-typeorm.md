---
"@dudousxd/nestjs-notifications-database-typeorm": minor
---

Persist the captured trigger context. Adds NULLABLE `causerType`/`causerId`/`traceId` columns to `NotificationEntity` and maps them in the store. These self-heal on existing tables via `ensureNotificationsTable`'s non-destructive column-add (they are nullable, so they are added — not skipped — even on a populated table), and old rows read back as null.
