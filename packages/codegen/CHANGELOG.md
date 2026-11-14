# @dudousxd/nestjs-notifications-codegen

## 0.7.0

### Minor Changes

- [#132](https://github.com/DavideCarvalho/nestjs-notifications/pull/132) [`45a9292`](https://github.com/DavideCarvalho/nestjs-notifications/commit/45a92923133aebe9c569dac92772bd05bcfd23bc) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - The injected inbox routes follow the Aviary list API: `list` takes `page`, `size`, `sort` and `'filter[type]'` and returns `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }`; `unread` returns `{ data }`; `unread` and `unreadCount` take `'filter[type]'`. The default `infiniteQueryOptions` selector of `@dudousxd/nestjs-codegen-tanstack` reads `meta.page`, so pass `getNextPageParam: nextNotificationsPage` from `@dudousxd/nestjs-notifications-client/tanstack`.

## 0.6.0

### Minor Changes

- [#129](https://github.com/DavideCarvalho/nestjs-notifications/pull/129) [`d7fcbe6`](https://github.com/DavideCarvalho/nestjs-notifications/commit/d7fcbe69693ba2894793d01ad0ed875ce4bd1f74) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking:** require Node.js 24 or newer. Every package now declares `engines.node` `>=24` (none declared it before). CI tests on Node 24 and 26.

  Also removed (see Reference → Upgrading in the docs):

  - `@dudousxd/nestjs-notifications-core`: the `TenantScopedNotifier` type, a deprecated alias of `ScopedNotifier`. Rename it.

## 0.5.2

### Patch Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.5.1

### Patch Changes

- 6546884: Document the new `?type=` query param (comma-separated notification types) on the generated `list`/`unread`/`unreadCount` inbox routes' query contracts.

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

- f98b115: Make the inbox base path configurable, so the API can avoid colliding with a `/notifications` page route under a shared global prefix.

  - database: `DatabaseChannelModule.forRoot({ controller: { path } })` (and `createNotificationsController({ path })`, already supported) mount the inbox at a custom base.
  - codegen: `nestjsNotificationsCodegen({ path })` emits the inbox routes at that path (independent of `name`, the client namespace).

  Keep the controller `path`, the codegen `path`, and the client `path` in sync.

## 0.3.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

## 0.2.0

### Minor Changes

- 276c1dc: New @dudousxd/nestjs-notifications-codegen package: a nestjs-codegen extension that emits the notifications HTTP API (inbox + optional preference center) into the generated client, so the endpoints are available as a typed client / TanStack hooks / Inertia helpers — even when mounting the createNotificationsController factory that static discovery can't see.
