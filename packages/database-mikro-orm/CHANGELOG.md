# @dudousxd/nestjs-notifications-database-mikro-orm

## 0.7.0

### Minor Changes

- 851170c: Persist the captured trigger context. Adds nullable `causerType`/`causerId`/`traceId` properties to `NotificationEntity` and maps them in the store (save/upsert). They self-heal on existing tables via the schema updater's safe (non-destructive) update, and old rows read back as null.

## 0.6.0

### Minor Changes

- 7af4226: Target MikroORM v7. The peer range is now `^7.0.0` for `@mikro-orm/core` and
  `@mikro-orm/nestjs` (v6 is no longer supported), and `@mikro-orm/decorators` is
  a new peer dependency (v7 moved the decorators out of `@mikro-orm/core`). The
  entity now imports its decorators from `@mikro-orm/decorators/legacy` and
  declares an explicit column `type` on every property so discovery works without
  `emitDecoratorMetadata`. Internally `persistAndFlush` was replaced with
  `persist().flush()` to match the v7 EntityManager.

## 0.5.0

### Minor Changes

- 39b9152: Implement the optional `NotificationStore.prune()` (scheduled pruning) and `upsert()` (updatable/progress notifications) for the mikro-orm store.

## 0.4.0

### Minor Changes

- 88aa12f: Multi-tenancy + use NestJS's own `@Inject` for service injection.

  **Multi-tenancy** (the same user can live in many workspaces — each with an isolated feed):

  - `notifications.forTenant(id)` / `forTenants([...])` scope a send to one or many tenants; a
    `@Tenant()` property on the notification (or notifiable) infers it, and may be a `string` or
    `string[]` (the send fans out to each tenant, one delivery + storage row per tenant).
  - The database channel stores a `tenantId` (column auto-created); the read API scopes by it:
    `notificationsQuery.forTenant(id).unread(user)`. TypeORM / MikroORM / Prisma adapters all carry
    `tenantId` and filter by it (undefined = all tenants). `SendResult` carries the `tenant`.
  - The tenant is threaded through the sync, event-emitter, BullMQ and Redis dispatchers, and is
    available to channels via the new `DeliveryContext` (3rd arg of `ChannelDriver.send`).

  **BREAKING (0.x): `@InjectService` removed.** Use NestJS's own `@Inject(TOKEN)` on a notification
  property — the library populates it from the container at delivery time by reading Nest's
  `PROPERTY_DEPS_METADATA`. One documented primitive instead of a custom decorator.

## 0.3.0

### Minor Changes

- bc24fcd: Self-contained schema: the database channel creates its table on its own.

  - `DatabaseChannelModule.forRoot/forFeature({ autoCreateSchema })` — defaults to **true**. On
    bootstrap the store's `ensureSchema()` creates the `notifications` table (and any missing
    columns) **non-destructively** (never drops). Set `false` to manage the schema via migrations.
  - `NotificationStore.ensureSchema?()` is now part of the interface; the TypeORM and MikroORM
    stores implement it using their own schema diff (so it's driver-portable). Prisma defers to
    `prisma migrate` (no-op + log).
  - Migration helpers for the migrations-controlled path:
    - TypeORM: `createNotificationsTable(queryRunner)` / `ensureNotificationsTable(dataSource)`.
    - MikroORM: `notificationsSchemaSql(em)` (for `this.addSql(...)`) / `ensureNotificationsTable(em)`.

  Real-SQLite integration tests cover create-on-demand and idempotency for both adapters.

## 0.2.1

### Patch Changes

- 4b3bd0a: Database channel: add an in-app read API and harden the ORM adapters.

  - New `NotificationsQueryService` (in `@dudousxd/nestjs-notifications-database`) for showing
    stored notifications in-app: `all`, `unread`, `unreadCount`, `paginate`, `markAsRead`,
    `markAllAsRead`, `delete` — accepts a `Notifiable` or a `{ type, id }` ref. Plus an optional
    `createNotificationsController({ resolveRef })` factory that mounts the matching REST routes.
  - TypeORM adapter: portable column types (works on SQLite/MySQL/Postgres) and code-set
    millisecond timestamps for stable ordering — fixes `timestamp`/`json`/`uuid` types that broke
    on SQLite.
  - MikroORM adapter: explicit `datetime` columns so `readAt`/`createdAt`/`updatedAt` round-trip as
    `Date` on every driver.

  Both ORM adapters now have real-database (SQLite) integration tests.
