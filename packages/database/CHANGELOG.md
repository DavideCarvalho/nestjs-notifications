# @dudousxd/nestjs-notifications-database

## 0.14.0

### Minor Changes

- e3ffb79: Detect duplicate inbox mounts, and scope the inbox's per-id mutations to their owner.

  `DatabaseChannelModule`'s `controller` option defaults to `true`, so `forRoot()` auto-mounts the
  inbox even when the application also mounts its own via `createNotificationsController()`. Apps have
  shipped believing that passing their own controller replaced the default one; instead they got two,
  with the auto-mounted duplicate sitting on the default `notifications` path — shadowing an unrelated
  page route served there, and carrying the module's `resolveRef` and guards rather than the ones on
  the hand-mounted controller.

  The default is unchanged. What changes is that the situation is no longer silent:

  - **Duplicate-mount warning.** A new `InboxMountAudit` provider (registered by both `forRoot()` and
    `forFeature()`) warns at `onApplicationBootstrap` when the inbox was both auto-mounted and
    hand-mounted, naming every path involved and pointing at `controller: false`. It runs at bootstrap
    rather than at module-construction time so it doesn't depend on module evaluation order.
  - **The `controller` option's docs** now state outright that mounting your own does not disable the
    auto-mount.

  **Ownership enforcement (behavior change).** `POST /notifications/:id/read` and
  `DELETE /notifications/:id` previously acted on any notification id, ignoring who was asking —
  `DELETE` never even resolved the current notifiable. Both now scope the mutation to the caller and
  respond `404` (not `403`, which would reveal which ids exist) for a notification belonging to
  someone else. Correct clients are unaffected.

  `NotificationStore` gains three **optional** methods, so existing stores keep compiling:

  - `deleteOwned(id, owner)` and `markAsReadOwned(id, owner)` — preferred; the ownership predicate
    goes into the query, so there is no read-then-write window.
  - `findById(id)` — the fallback, used when the scoped mutations are absent.

  All four bundled stores implement all three. A custom store implementing none of them cannot verify
  ownership; the query service logs a warning naming the store instead of silently skipping the check.
  `NotificationsQueryService.delete(id)` / `markAsRead(id)` called _without_ a target remain unscoped,
  so programmatic callers acting outside a request are unaffected. `forTenant(t)` now carries its
  tenant into the ownership check, which `forTenant(t).delete(id)` previously dropped.

## 0.13.1

### Patch Changes

- 3e06964: Derive the notification's display/persistence name via core's instance-aware `notificationName()`
  helper instead of inline class-level lookups. Completes the `notificationType?()` feature from
  core 0.9.0: `DatabaseChannel` now persists the instance-level type to the `type` column (what the
  inbox `?type=` filter matches), and delivery-tracking / the Telescope watcher label entries with
  it. Classes without `notificationType()` behave exactly as before.

## 0.13.0

### Minor Changes

- 6546884: Add a `types` filter to the inbox read path. `NotificationStore.getForNotifiable`/`getUnread` gain a trailing optional `types?: string[]` parameter, and `PaginateForNotifiableOptions` gains `types?: string[]` — when present and non-empty, only rows whose `type` is in the list are returned; absent or an empty array matches every type (unchanged behavior). `NotificationsQueryService`/`ScopedNotificationsQuery`'s `all()`/`unread()`/`unreadCount()` gain an optional `{ types? }` options argument, and `PaginateOptions` gains `types?: string[]`. `createNotificationsController`'s `GET /`, `GET /unread`, and `GET /unread/count` routes now accept `?type=A,B` (comma-separated, trimmed, blanks dropped) and thread it through. The in-memory store implements the filter; the shared `NotificationStore` contract in `test-contracts/notification-store.contract.ts` gained coverage exercised by every adapter's `*.contract.spec.ts`.

## 0.12.0

### Minor Changes

- 0048cb5: Ecosystem-wide improvements across reliability, delivery, localization, and packaging.

  ## ⚠️ Breaking-ish: `ChannelContext` payload signature

  Channel payload methods now receive a `ChannelContext` argument. Methods such as
  `toMail(notifiable)` become `toMail(notifiable, ctx)` / `toMail(ctx)` — the channel
  payload method signature has changed. This is the one source-level change consumers
  must adapt to. Because the ecosystem is still pre-1.0 (alpha), this is shipped as a
  **minor** bump rather than a major. Update any custom channel payload methods
  (`toMail`, `toSms`, `toPush`, `toSlack`, `toDiscord`, `toTelegram`, `toTeams`,
  `toWebhook`, `toBroadcast`, etc.) to accept the new `ChannelContext`.

  ## Reliability & delivery
  - **Dedup / idempotency keys** — duplicate dispatches are collapsed via configurable idempotency keys.
  - **Throttle / rate-limiting** — per-channel/per-recipient throttling to protect downstream providers.
  - **Durable Redis dispatcher** — sorted-set backed queue with a dead-letter queue (DLQ) for failed jobs.
  - **Configurable BullMQ retry/backoff/DLQ** — tunable retry counts, backoff strategy, and DLQ routing.
  - **Push batch send + dead-token pruning** — batched push delivery with automatic pruning of dead/expired tokens.
  - **Generalized provider failover** — failover across providers for SMS, webhook, and Slack channels.
  - **Cross-channel fallback chains** — fall back to alternate channels when a primary channel fails.

  ## Scheduling & preferences
  - **Quiet hours + timezone** — suppress/defer delivery during recipient quiet hours, timezone-aware.
  - **REAL digest collection + flush** — actual pending-digest collection and scheduled flush, backed by
    pending-digest stores (in-memory / TypeORM / MikroORM / Prisma).

  ## Localization & sync
  - **i18n / localization** — `LocaleResolver` + `Translator` for localized notification content.
  - **Cross-device read-sync** — read state synchronized across a recipient's devices.

  ## Data layer
  - **DB-level pagination pushdown** — pagination is pushed down to the database instead of in-memory slicing.
  - **Cross-store contract tests** — shared contract test suites run against every store implementation, plus
    Postgres/MySQL testcontainers integration coverage.

  ## Packaging
  - **Dual ESM/CJS packaging** — all packages now ship both ESM and CJS builds (tsup), with a LICENSE per package.

## 0.11.0

### Minor Changes

- 851170c: Persist the captured trigger context. `StoredNotification` and `NewStoredNotification` gain optional `causerType`/`causerId`/`traceId` fields, and the database channel now records WHO triggered a notification (plus its correlation trace) when `@dudousxd/nestjs-context` is present — including for async deliveries, since the carrier rides through the dispatcher. The captured tenant fills an otherwise-unscoped row's `tenantId`. The in-memory store persists the new fields; back-compat is preserved (no captured context → null).

## 0.10.0

### Minor Changes

- 580ae5c: The auto-mounted inbox controller now accepts `guards` via the `controller`
  option (`DatabaseChannelModule.forRoot({ controller: { guards: [AuthGuard], path, resolveRef } })`).
  This lets apps that need an auth guard on the inbox keep using the auto-mounted
  controller instead of wiring `createNotificationsController` by hand.

## 0.9.0

### Minor Changes

- f98b115: Make the inbox base path configurable, so the API can avoid colliding with a `/notifications` page route under a shared global prefix.

  - database: `DatabaseChannelModule.forRoot({ controller: { path } })` (and `createNotificationsController({ path })`, already supported) mount the inbox at a custom base.
  - codegen: `nestjsNotificationsCodegen({ path })` emits the inbox routes at that path (independent of `name`, the client namespace).

  Keep the controller `path`, the codegen `path`, and the client `path` in sync.

## 0.8.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

## 0.7.0

### Minor Changes

- 1d9d52b: The controller factories (`createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`) accept `guards` (applied via `@UseGuards`) and a custom `path`. The inbox/preferences/stream are per-user, so apps can now protect the auto-mounted endpoints with their auth guard.

## 0.6.0

### Minor Changes

- 39b9152: Auto-mount the inbox REST controller from `DatabaseChannelModule.forRoot({ controller })` (default true; pass `false` to mount it yourself, or `{ resolveRef }` to customize). Add a configurable scheduled `prune` (`forRoot({ prune: { olderThan, every?, onlyRead?, runOnStartup? } })`) backed by a new optional `NotificationStore.prune()` method (implemented for the in-memory store).
- 3ddc26c: Support updatable "live"/progress notifications: a notification can return a stable `databaseKey(notifiable)` and the database channel upserts that row in place across sends (updating data and resetting read state) instead of inserting a new one. Backed by a new optional `NotificationStore.upsert()` (implemented for the in-memory store).

## 0.5.0

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
