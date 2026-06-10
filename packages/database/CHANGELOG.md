# @dudousxd/nestjs-notifications-database

## 0.4.0

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

### Patch Changes

- 9361399: Core DX overhaul (all additive):

  - **`send()` returns a `SendResult[]`** — per-notifiable, per-channel outcome
    (`sent`/`failed`/`skipped`/`queued`) with the transport `response` or `error`.
  - **`shouldSend(notifiable, channel)`** — Laravel-style per-channel gate (skipped channels are
    reported, not delivered).
  - **`afterSending(notifiable, channel, response)`** — lifecycle hook called after each delivery
    with the channel's transport response.
  - **`delay`** (ms or `Date`) — scheduled delivery, honored by the BullMQ (native), Redis and
    in-process event-emitter dispatchers.
  - **Decorator-driven notifiables** — declare addresses with `@RouteFor('mail')` and the async
    reference with `@Notifiable()` + `@NotifiableId()`, dropping the `routeNotificationFor` switch
    and manual `toNotifiableRef()` (the method form still works and overrides the decorators).

  Channels now resolve addresses via `routeFor` and return their transport response so it flows
  into `afterSending`/`SendResult`.

## 0.3.0

### Minor Changes

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
