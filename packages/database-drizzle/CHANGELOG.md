# @dudousxd/nestjs-notifications-database-drizzle

## 0.1.1

### Patch Changes

- [#100](https://github.com/DavideCarvalho/nestjs-notifications/pull/100) [`b9a1946`](https://github.com/DavideCarvalho/nestjs-notifications/commit/b9a1946a4e6ac6ce7253112c8d95f1e0459bf414) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Republish from CI through npm trusted publishing (OIDC) so the release carries a provenance attestation; 0.1.0 was a one-time manual first publish.

## 0.1.0

### Minor Changes

- [#96](https://github.com/DavideCarvalho/nestjs-notifications/pull/96) [`9e6f15f`](https://github.com/DavideCarvalho/nestjs-notifications/commit/9e6f15f99b8d0446e866d6ee068da28ad19a4d8d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - New package: `@dudousxd/nestjs-notifications-database-drizzle` — a Drizzle ORM (Postgres) adapter for the database channel and the digest feature, alongside the TypeORM / MikroORM / Prisma adapters.

  - `DrizzleNotificationStore` implements the full `NotificationStore` SPI (incl. `deleteOwned` / `markAsReadOwned` / `findById`, pushed-down `paginateForNotifiable`, `prune`, and an atomic `INSERT … ON CONFLICT` `upsert`).
  - `DrizzlePendingDigestStore` implements `PendingDigestStore`; the window lock is `ON CONFLICT DO NOTHING RETURNING` (at most once per window under concurrent schedulers).
  - `createNotificationTables({ tableNames, schema })` returns the tables as `pgTable`s for your drizzle-kit schema; `ensureSchema()` / `notificationsSchemaDdl()` / `pendingDigestSchemaDdl()` for non-drizzle-kit setups; `notificationsManagedTables()`.
  - `DrizzleNotificationStoreModule` / `DrizzlePendingDigestStoreModule` with `forRoot({ db, tables })`, `forRootAsync(...)` and `forFeature()`.
  - Runs the shared store contracts on PGlite by default and on real Postgres in `pnpm test:db`.
