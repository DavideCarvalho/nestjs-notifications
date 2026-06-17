---
"@dudousxd/nestjs-notifications-database": minor
---

Persist the captured trigger context. `StoredNotification` and `NewStoredNotification` gain optional `causerType`/`causerId`/`traceId` fields, and the database channel now records WHO triggered a notification (plus its correlation trace) when `@dudousxd/nestjs-context` is present — including for async deliveries, since the carrier rides through the dispatcher. The captured tenant fills an otherwise-unscoped row's `tenantId`. The in-memory store persists the new fields; back-compat is preserved (no captured context → null).
