# @dudousxd/nestjs-notifications-discord

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

- 9402607: Internal refactors (behavior-preserving): extract a shared `BaseChannel` + common HTTP helpers to dedupe the 8 channel adapters, and add a `defineChannelModule` factory that the simple HTTP channels (slack/discord/teams/telegram/webhook) delegate to.

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
