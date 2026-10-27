# @dudousxd/nestjs-notifications-database-drizzle

## 0.1.2

### Patch Changes

- [#121](https://github.com/DavideCarvalho/nestjs-notifications/pull/121) [`c60fe8a`](https://github.com/DavideCarvalho/nestjs-notifications/commit/c60fe8ae739c9163e5d2d792f445db1ac4c9c54b) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Performance fixes for large sends and busy inboxes.

  - A send to many recipients keeps at most 50 deliveries in flight instead of starting all of them at once. Async sends hand all their jobs to the dispatcher together: the new optional `DispatchDriver.dispatchMany`, which the BullMQ dispatcher implements with chunked `addBulk`. If one recipient's guard check or delivery throws, every other recipient is still dispatched before the `send()` rejects with that error.
  - The in-memory idempotency store no longer walks its whole map on every reservation, and the in-memory throttle store evicts elapsed windows.
  - `unreadCount()` runs a `COUNT` through the new optional `NotificationStore.countUnread`, implemented by the in-memory, TypeORM, MikroORM, Drizzle and Prisma stores.
  - The TypeORM and MikroORM `notifications` tables get a `(notifiable_type, notifiable_id, created_at)` index, which `ensureSchema()` adds to existing tables.
  - The preference-center gate reads a recipient's stored preferences once per delivery instead of once per channel.
  - The digest collector reads pending groups a page at a time (new optional `PendingDigestStore.listGroupsPage`) and clears flushed entries in chunks. Every SQL `clear()` splits large id lists, so a backlog past the engine's bind-parameter limit is no longer left uncleared.
  - The in-memory delivery-tracking store indexes provider message ids and keeps only the most recent 10,000 records.
  - Quiet-hours evaluation reuses one `Intl.DateTimeFormat` per timezone.

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
