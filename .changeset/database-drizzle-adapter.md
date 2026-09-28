---
'@dudousxd/nestjs-notifications-database-drizzle': minor
---

New package: `@dudousxd/nestjs-notifications-database-drizzle` — a Drizzle ORM (Postgres) adapter for the database channel and the digest feature, alongside the TypeORM / MikroORM / Prisma adapters.

- `DrizzleNotificationStore` implements the full `NotificationStore` SPI (incl. `deleteOwned` / `markAsReadOwned` / `findById`, pushed-down `paginateForNotifiable`, `prune`, and an atomic `INSERT … ON CONFLICT` `upsert`).
- `DrizzlePendingDigestStore` implements `PendingDigestStore`; the window lock is `ON CONFLICT DO NOTHING RETURNING` (at most once per window under concurrent schedulers).
- `createNotificationTables({ tableNames, schema })` returns the tables as `pgTable`s for your drizzle-kit schema; `ensureSchema()` / `notificationsSchemaDdl()` / `pendingDigestSchemaDdl()` for non-drizzle-kit setups; `notificationsManagedTables()`.
- `DrizzleNotificationStoreModule` / `DrizzlePendingDigestStoreModule` with `forRoot({ db, tables })`, `forRootAsync(...)` and `forFeature()`.
- Runs the shared store contracts on PGlite by default and on real Postgres in `pnpm test:db`.
