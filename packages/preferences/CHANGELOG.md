# @dudousxd/nestjs-notifications-preferences

## 0.6.0

### Minor Changes

- [#121](https://github.com/DavideCarvalho/nestjs-notifications/pull/121) [`c9d63a6`](https://github.com/DavideCarvalho/nestjs-notifications/commit/c9d63a665ffdb6ae3fba4657cf4feaa246c20564) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Bug fix that changes which notifications are delivered.** `PreferencesModule.forRoot()`, `forCenter()` and `forDigest()` bound the core `NOTIFICATION_PREFERENCE_GATE` / `NOTIFICATION_DIGEST_SINK` tokens without exporting them, so the `ChannelRunner` inside `NotificationsModule` never saw them: muted channels, preference-center toggles, `off`/digest cadences and quiet hours were all ignored and every channel was delivered. The modules now export those tokens, so deliveries honour the stored preferences as documented: a channel a user turned off is skipped, and a `daily`/`weekly` category is collected into its digest.

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

- [#121](https://github.com/DavideCarvalho/nestjs-notifications/pull/121) [`92b8c41`](https://github.com/DavideCarvalho/nestjs-notifications/commit/92b8c415c6edce839ecad87c49a338368272d811) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - When an app imports both `PreferencesModule.forRoot()` and `PreferencesModule.forCenter()`, the preference center's gate now decides deliveries whichever module is imported first, as documented ("forCenter replaces the simple opt-out gate"). Before, the module imported first provided the gate, so importing `forRoot()` first left the opt-out gate in charge and preference-center toggles were ignored. Apps that import only one of the two are unaffected.

## 0.5.2

### Patch Changes

- c68e5b3: Add NestJS 12 to the supported peer range.

  Every `@nestjs/*` peer that read `^10.0.0 || ^11.0.0` now also admits `^12.0.0`, and the
  `@nestjs/event-emitter` peer — which NestJS 12 renumbered from the 3.x line onto the framework's
  own 12.x line — reads `^2.0.0 || ^3.0.0 || ^12.0.0`. Installing on NestJS 12 no longer trips a peer
  warning; hosts on 10 or 11 are unaffected.

  The satellite peers move with it: `@nestjs/websockets` and `@nestjs/platform-socket.io`
  (broadcast), `@nestjs/bullmq` (bullmq) and `@nestjs/typeorm` (database-typeorm) all have a 12.x
  release, so none of them holds a package back.

  One source change was needed, in `sse`. NestJS 12 widened `MessageEvent['data']` to include
  `undefined`, so under `exactOptionalPropertyTypes` the hub's cast no longer satisfied the
  `Subject<MessageEvent>` it feeds; the cast is now `NonNullable<MessageEvent['data']>`. Runtime
  behaviour is unchanged — the backplane never publishes an undefined payload.

  Nothing else in the source needed touching. NestJS 12 ships its core packages as pure ESM and these
  libraries are already `"type": "module"`, and none of them implements a `PipeTransform` or
  subclasses `ConsoleLogger` — the two v12 signature changes that would otherwise have reached
  library code. The test suite runs against `@nestjs/common` 12.0.1.

## 0.5.1

### Patch Changes

- 94a7e57: `PENDING_DIGEST_STORE` is now a `Symbol.for` global-registry token, and the database adapters
  inline it instead of value-importing it from `@dudousxd/nestjs-notifications-preferences`.
  Preferences is declared an optional peer of the adapters, but the value import made
  `require`-ing any adapter crash at boot (`Cannot find module`) for consumers that don't install
  preferences — the digest store module rode along the package index. DI identity is unchanged
  (same registry key on both sides, pinned by a drift test); consumers importing the token from
  preferences are unaffected.

## 0.5.0

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

## 0.4.0

### Minor Changes

- 1d9d52b: The controller factories (`createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`) accept `guards` (applied via `@UseGuards`) and a custom `path`. The inbox/preferences/stream are per-user, so apps can now protect the auto-mounted endpoints with their auth guard.

## 0.3.0

### Minor Changes

- 67db54f: Add a full preference center: per-category × channel toggles, per-category digest frequency, mandatory categories, a category-aware PreferenceCenterGate, and an HTTP controller for a preferences UI.
