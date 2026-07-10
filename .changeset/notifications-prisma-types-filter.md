---
"@dudousxd/nestjs-notifications-database-prisma": minor
---

Implement the new `types` filter (`{ type: { in: [...] } }`) across `getForNotifiable`/`getUnread`/`paginateForNotifiable`. No `notificationsManagedTables()` here: the adapter is schema-first and consumer-owned (no owned-table constant, `ensureSchema()` is a deliberate no-op) — there's no equivalent "tables this store creates" list to expose.
