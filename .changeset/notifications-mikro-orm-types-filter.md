---
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
---

Implement the new `types` filter (native `$in` on `type`) across `getForNotifiable`/`getUnread`/`paginateForNotifiable`. Add `notificationsManagedTables()`, exported from the package root, returning the table name(s) this store creates/manages (`['notifications']`, derived from the same `OWNED_TABLE_NAMES` set `ensureSchema()` scopes its fingerprint to) — feed it to your MikroORM `schemaGenerator.skipTables` (or equivalent) so a consumer's schema-diff exclude list never hand-maintains this table name separately, mirroring `durableManagedTables()`/`telescopeManagedTables()` from the sibling ecosystem libs.
