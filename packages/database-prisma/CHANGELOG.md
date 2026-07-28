# @dudousxd/nestjs-notifications-database-prisma

## 0.8.0

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

## 0.7.1

### Patch Changes

- 94a7e57: `PENDING_DIGEST_STORE` is now a `Symbol.for` global-registry token, and the database adapters
  inline it instead of value-importing it from `@dudousxd/nestjs-notifications-preferences`.
  Preferences is declared an optional peer of the adapters, but the value import made
  `require`-ing any adapter crash at boot (`Cannot find module`) for consumers that don't install
  preferences — the digest store module rode along the package index. DI identity is unchanged
  (same registry key on both sides, pinned by a drift test); consumers importing the token from
  preferences are unaffected.

## 0.7.0

### Minor Changes

- 6546884: Implement the new `types` filter (`{ type: { in: [...] } }`) across `getForNotifiable`/`getUnread`/`paginateForNotifiable`. No `notificationsManagedTables()` here: the adapter is schema-first and consumer-owned (no owned-table constant, `ensureSchema()` is a deliberate no-op) — there's no equivalent "tables this store creates" list to expose.

## 0.6.0

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

## 0.5.0

### Minor Changes

- 851170c: Persist the captured trigger context. The store now reads/writes `causerType`/`causerId`/`traceId`, writing them only when supplied so consumers who have not added the columns are unaffected. Prisma is schema-first/consumer-managed: to persist these, add three nullable `String?` columns (`causerType`, `causerId`, `traceId`) to your `Notification` model in `schema.prisma` and run `prisma migrate` — the library does not run DDL.

## 0.4.0

### Minor Changes

- 39b9152: Implement the optional `NotificationStore.prune()` (scheduled pruning) and `upsert()` (updatable/progress notifications) for the prisma store.

## 0.3.0

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

## 0.2.1

### Patch Changes

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
