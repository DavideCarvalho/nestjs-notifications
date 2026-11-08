# @dudousxd/nestjs-notifications-delivery-tracking

## 0.4.0

### Minor Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking.** Who reaches a mounted route is now decided only with NestJS's first-party `@nestjs/authentication` / `@nestjs/authorization`: pass `decorators`, or mount the controller yourself.

  - New `decorators?: ClassDecorator[]` option, applied in order to every controller the library mounts: `DatabaseChannelModule.forRoot()`/`forFeature()`, `createNotificationsController()`, `createNotificationsStreamController()`, `createPreferenceCenterController()`, `createTwilioStatusController()` and `createSesNotificationController()`. E.g. `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]`.
  - `guards` is removed from `DatabaseChannelModule`'s `controller` options and from `createNotificationsController()`, `createNotificationsStreamController()` and `createPreferenceCenterController()`.
  - `DatabaseChannelModule.forRoot()`/`forFeature()` take `routes?: boolean` (default `true`) to turn the inbox auto-mount off; `controller` now only takes `{ resolveRef, path }` (no more `controller: false`).
  - The auto-mounted inbox's default resolver answers `401` when there is no `req.user.id`, instead of resolving every anonymous caller to one shared `"undefined"` inbox.
  - Every controller is marked open to `@nestjs/authorization`'s deny-by-default global guard (`authorization:can-anyone`, what `Can.Anyone()` writes), so registering `AuthorizationModule.forRoot()` doesn't lock them; a `@Can()` passed in `decorators` is still enforced. No dependency on `@nestjs/authorization` is added.
  - Nothing refuses to boot in production: inbox, SSE and preference routes are scoped to the resolved recipient, and delivery-tracking callbacks stay reachable by the providers (Twilio is signature-verified).

  Migration: `guards: [G]` → `decorators: [UseGuards(G)]` (or mount the controller in your own module); `controller: false` → `routes: false`; `controller: { guards, ... }` → `controller: { ... }` plus top-level `decorators`.

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - New `@dudousxd/nestjs-notifications-delivery-tracking/mail` subpath: `mailDeliveryTracking()` records the mail `@nestjs/mail` sends outside notifications (from `MailEvents`, with the provider message id, so SES bounces correlate). Notification mail is skipped there, since the notification listener records it. Optional peers: `@nestjs/mail`, `@dudousxd/nestjs-notifications-mail`.

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking.** `createSesNotificationController()` now verifies every Amazon SNS message, and refuses with `403` (recording nothing) any message it can't verify. Before, `verifySignature: true` only logged a warning and anyone who could reach the path could post forged bounce/delivery events.

  - SNS signatures are checked with AWS's documented algorithm: the canonical string-to-sign per message type, `SignatureVersion` `1` (SHA1withRSA) or `2` (SHA256withRSA), any other version refused. The signing certificate is fetched only from an `https://sns.<region>.amazonaws.com[.cn]/….pem` URL (checked before any request), with a timeout (`certificateTimeoutMs`, default 5000), and cached by URL (bounded).
  - New required `topicArns: string[]`: messages (including subscription confirmations) from any other topic are refused.
  - `maxMessageAgeMs` (default one hour, `false` to skip) refuses stale or far-future `Timestamp`s.
  - Notifications are deduplicated by `MessageId` (in-memory by default; `messageIdStore` for your own, `false` to turn off).
  - `SubscriptionConfirmation` is acted on only after verification: `onSubscriptionConfirmation(message)` hook, and `autoConfirmSubscription` GETs the `SubscribeURL` only when it is an SNS host.
  - SNS's `Content-Type: text/plain` bodies are read whatever body parser the app uses.
  - `verifySignature` now defaults to `true`; `false` skips only the signature (for a verifying gateway in front).
  - `certificateLoader` and `fetch` can be injected for tests. `SnsMessageVerifier`, `buildSnsStringToSign`, `isSnsUrl`, `parseSnsMessage` and `InMemorySnsMessageIdStore` are exported.

  Migration: `createSesNotificationController({ ... })` → `createSesNotificationController({ topicArns: ['arn:aws:sns:<region>:<account>:<topic>'], ... })`.

### Patch Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.3.3

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

## 0.3.2

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

## 0.3.1

### Patch Changes

- 3e06964: Derive the notification's display/persistence name via core's instance-aware `notificationName()`
  helper instead of inline class-level lookups. Completes the `notificationType?()` feature from
  core 0.9.0: `DatabaseChannel` now persists the instance-level type to the `type` column (what the
  inbox `?type=` filter matches), and delivery-tracking / the Telescope watcher label entries with
  it. Classes without `notificationType()` behave exactly as before.

## 0.3.0

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

## 0.2.0

### Minor Changes

- 67db54f: New delivery-tracking package: persists per-channel delivery status (queued/sent/failed/delivered/bounced) by listening to core events, with inbound webhook controllers for Twilio and AWS SES status callbacks.
