---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-prisma": minor
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-sms": minor
"@dudousxd/nestjs-notifications-push": minor
"@dudousxd/nestjs-notifications-slack": minor
"@dudousxd/nestjs-notifications-discord": minor
"@dudousxd/nestjs-notifications-telegram": minor
"@dudousxd/nestjs-notifications-teams": minor
"@dudousxd/nestjs-notifications-webhook": minor
"@dudousxd/nestjs-notifications-broadcast": minor
"@dudousxd/nestjs-notifications-sse": minor
"@dudousxd/nestjs-notifications-bullmq": minor
"@dudousxd/nestjs-notifications-redis": minor
"@dudousxd/nestjs-notifications-event-emitter": minor
"@dudousxd/nestjs-notifications-delivery-tracking": minor
"@dudousxd/nestjs-notifications-client": minor
"@dudousxd/nestjs-notifications-react": minor
"@dudousxd/nestjs-notifications-codegen": minor
"@dudousxd/nestjs-notifications-telescope": minor
"@dudousxd/nestjs-notifications-testing": minor
---

Ecosystem-wide improvements across reliability, delivery, localization, and packaging.

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
