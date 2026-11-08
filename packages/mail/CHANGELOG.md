# @dudousxd/nestjs-notifications-mail

## 0.11.0

### Minor Changes

- [#124](https://github.com/DavideCarvalho/nestjs-notifications/pull/124) [`b6ba0bc`](https://github.com/DavideCarvalho/nestjs-notifications/commit/b6ba0bc0395c5d122353981e123cc748dc3c3d5c) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - `url` attachments are downloaded with limits and an SSRF guard. Defaults: `https:` only, hosts that are or resolve to loopback/private/link-local/other non-public addresses are refused (checked at connect time), a 30 s timeout and a 25 MiB cap enforced while streaming; redirects are still refused. Configure with `MailChannelModule.forRoot({ attachments: { allowHttp, allowPrivateHosts, timeoutMs, maxBytes } })`. An `http:` or internal-host attachment that downloaded before now fails until you allow it.

## 0.10.0

### Minor Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking.** The mail channel sends through `@nestjs/mail`'s `Mailer`; Aviary's transports are removed.

  - Configure `MailModule.forRoot({ transport, from, retry })` from `@nestjs/mail` (peer ~0.0.2, Nest `^11 || ^12`); `MailChannelModule.forRoot({ renderer?, rendererInstance?, retry?, global? })` keeps rendering.
  - Removed: `NodemailerTransport`, `SesTransport`, `composeRawEmail`, `LogMailTransport`, `NullMailTransport`, the `MailTransport`/`MailTransportPayload`/`SMTPOptions` types, `MAIL_TRANSPORT`, `MAIL_SMTP_OPTIONS`, `MAIL_TRANSPORT_RESOLVER`, and the `from`/`smtp`/`transport`/`transportInstance`/`resolveTransport` options; the `nodemailer` and `@aws-sdk/client-sesv2` peers.
  - `toMail()` may return `{ mail: MailClass, data }` (a `@nestjs/mail` mail class, sent in the recipient's locale).
  - The channel returns `MailSendResult`, so delivery tracking records the provider message id (SES bounces now correlate); it forwards the delivery `idempotencyKey` and the optional `retry`.
  - `TenantRoutingMailTransport` picks a tenant's transport per message from an AsyncLocalStorage mail scope (`runInMailScope`, `currentMailScope`).
  - `MailMessage.replyTo()` and `.header()`; `attach({ filename, url })` downloads the file (`@nestjs/mail`'s `path` is local only).

  Migration: `MailChannelModule.forRoot({ from, smtp })` → `MailModule.forRoot({ from, transport: new SmtpTransport(smtp) })` + `MailChannelModule.forRoot()`; `resolveTransport` → `new TenantRoutingMailTransport(resolve, fallback)`; `SesTransport({ client })` → `@nestjs/mail`'s `SesTransport({ region })`.

### Patch Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

## 0.9.0

### Minor Changes

- [#98](https://github.com/DavideCarvalho/nestjs-notifications/pull/98) [`28ede69`](https://github.com/DavideCarvalho/nestjs-notifications/commit/28ede690ce0d2ffe4d1d99537c45bc6c87613c40) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - - New `LogMailTransport`: logs each message to the Nest logger instead of sending it, as a "log" driver for development.
  - New `NullMailTransport`: drops mail and logs the drop at debug level, for environments where outgoing mail is disabled (CI, air-gapped installs without a relay).
  - The `smtp` option (and `NodemailerTransport`) now also accept an SMTP connection URL (`smtp://user:pass@host:587`).

## 0.8.3

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
