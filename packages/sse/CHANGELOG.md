# @dudousxd/nestjs-notifications-sse

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
