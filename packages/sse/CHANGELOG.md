# @dudousxd/nestjs-notifications-sse

## 0.7.1

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

## 0.7.0

### Minor Changes

- 6546884: Add `redisSseBackplane(createClient, options?)` — a factory for `RedisSseBackplane` that calls `createClient()` twice (one publisher, one subscriber) so the "two separate connections" rule (a client in subscriber mode rejects regular commands) can't be violated by accident. Stays BYO: the package still doesn't depend on `ioredis`, and the consumer keeps full control over client construction/config.

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

## 0.5.1

### Patch Changes

- 13b4e47: mail: add `SesTransport` — an AWS SES v2 `MailTransport` that builds a full MIME message (so attachments work, unlike SES "Simple" content) via nodemailer's MailComposer and sends it as `Content.Raw`. `@aws-sdk/client-sesv2` is an optional peer (imported lazily). Also exports `composeRawEmail`.

  sse: loosen `RedisPubSubClient.subscribe` to a single-channel signature (drop the optional callback) so a raw `ioredis` instance is assignable with no `as unknown as` cast — its variadic `subscribe` overload requires a trailing callback that the previous signature couldn't match.

## 0.5.0

### Minor Changes

- 1d9d52b: The controller factories (`createNotificationsController`, `createNotificationsStreamController`, `createPreferenceCenterController`) accept `guards` (applied via `@UseGuards`) and a custom `path`. The inbox/preferences/stream are per-user, so apps can now protect the auto-mounted endpoints with their auth guard.

## 0.4.0

### Minor Changes

- 4c9c2ea: Add `SseChannelModule.forRootAsync({ useFactory, inject })` so the cross-pod `backplane` (and event name) can be built from DI — e.g. constructing a `RedisSseBackplane` from your app's Redis config service.
- e3fbd5e: Add `createNotificationsStreamController({ resolveRoute, resolveTenant?, path?, streamPath?, heartbeatMs? })` — a factory that mounts the native `@Sse()` streaming endpoint (subscribing to `SseHub` under the channel's `sseKey`), with a built-in heartbeat, so apps don't hand-write the SSE endpoint.

## 0.3.0

### Minor Changes

- 276c1dc: Add a pluggable cross-pod backplane to the SSE channel. The hub is in-process by default; pass a `backplane` to `SseChannelModule.forRoot` (e.g. the bundled `RedisSseBackplane`, an `ioredis`-based pub/sub fan-out) so a publish on any node reaches the SSE connections on every node — for deployments where the writer and the node holding the connection are different processes.
