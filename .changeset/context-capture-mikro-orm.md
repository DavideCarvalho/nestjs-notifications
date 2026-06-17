---
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
---

Persist the captured trigger context. Adds nullable `causerType`/`causerId`/`traceId` properties to `NotificationEntity` and maps them in the store (save/upsert). They self-heal on existing tables via the schema updater's safe (non-destructive) update, and old rows read back as null.
