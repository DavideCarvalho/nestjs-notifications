---
"@dudousxd/nestjs-notifications-database-typeorm": minor
---

Implement the new `types` filter (native `In(...)` on `type`) across `getForNotifiable`/`getUnread`/`paginateForNotifiable`. Add `notificationsManagedTables()`, exported from the package root, returning the table name(s) this store creates/manages (`['notifications']`, derived from the same `TABLE` constant `ensureNotificationsTable` targets) — feed it to your migration tooling's exclude/skip list, mirroring `durableManagedTables()`/`telescopeManagedTables()` from the sibling ecosystem libs.
