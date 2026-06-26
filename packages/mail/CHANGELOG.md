# @dudousxd/nestjs-notifications-mail

## 0.8.2

### Patch Changes

- f7bf54b: Ship TanStack Intent agent skills (SKILL.md) inside the package.

## 0.8.1

### Patch Changes

- 9402607: Internal refactors (behavior-preserving): extract a shared `BaseChannel` + common HTTP helpers to dedupe the 8 channel adapters, and add a `defineChannelModule` factory that the simple HTTP channels (slack/discord/teams/telegram/webhook) delegate to.

## 0.8.0

### Minor Changes

- f379cf8: Add `@dudousxd/nestjs-notifications-resilience` — `resilientTransport()` wraps an ordered list of provider transports with a per-provider circuit breaker, a per-attempt timeout, and ordered failover (powered by `@dudousxd/nestjs-resilience`), with optional fleet-wide breaker state via the resilience store adapters. Drops into a channel's `transportInstance`.

  BREAKING: removed the legacy stateless failover (`FailoverSmsTransport`, `FailoverMailTransport`, and the core `failover()` / `FailoverListener`). They had no circuit breaker and no per-attempt timeout — use `resilientTransport()` instead.

## 0.7.1

### Patch Changes

- ac5489a: fix: import `nodemailer/lib/mail-composer` with an explicit `/index.js` so it resolves under Node's ESM loader. Directory imports (without the filename) are rejected by the ESM resolver — this only worked under the CJS build, and broke consumers running the package as ESM (e.g. under Vitest).

## 0.7.0

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

## 0.6.0

### Minor Changes

- 13b4e47: mail: add `SesTransport` — an AWS SES v2 `MailTransport` that builds a full MIME message (so attachments work, unlike SES "Simple" content) via nodemailer's MailComposer and sends it as `Content.Raw`. `@aws-sdk/client-sesv2` is an optional peer (imported lazily). Also exports `composeRawEmail`.

  sse: loosen `RedisPubSubClient.subscribe` to a single-channel signature (drop the optional callback) so a raw `ioredis` instance is assignable with no `as unknown as` cast — its variadic `subscribe` overload requires a trailing callback that the previous signature couldn't match.

## 0.5.0

### Minor Changes

- 1a4618e: Add attachment support to the mail channel. `MailMessage.attach({ filename, content?, path?, contentType?, cid? })` adds files, carried through `MailTransportPayload.attachments` to the transport; `NodemailerTransport` maps them to nodemailer attachments. The new `MailAttachment` type is exported. Renderers ignore attachments (they're not part of the body).

## 0.4.0

### Minor Changes

- 67db54f: Add built-in `ReactEmailRenderer` (React Email) and `MjmlMailRenderer` (MJML) renderers, plus `MailMessage.react()` / `.mjml()`. Add `FailoverMailTransport` for multi-provider failover (e.g. SES → Resend) and `transportInstance` / `rendererInstance` module options. `MailRenderer.render` may now be async.

## 0.3.0

### Minor Changes

- 09170d8: Per-tenant channel config, rich email, and an app-wide preference gate.

  - **Per-tenant config**: mail/sms/push take `resolveTransport(tenant)` and slack/webhook take
    `resolveOptions(tenant)` — a send scoped with `forTenant(id)` uses that tenant's credentials,
    falling back to the default when none.
  - **Rich email**: `MarkdownMailRenderer` + `MailMessage.markdown()` render Markdown to HTML (via
    the optional `marked` peer).
  - **Preference gate**: core gained an optional `PreferenceGate` (token
    `NOTIFICATION_PREFERENCE_GATE`) consulted before every channel delivery — muted channels are
    reported as `skipped`. See the new `@dudousxd/nestjs-notifications-preferences` package.

## 0.2.1

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
