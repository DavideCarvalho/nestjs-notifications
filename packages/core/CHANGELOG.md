# @dudousxd/nestjs-notifications-core

## 0.9.0

### Minor Changes

- 6546884: Add `notificationType()` — an optional per-INSTANCE override for a notification's display/persistence name (`notificationName()` in `base-channel.ts`), for consumers with one generic notification class carrying many event names in its instance data. Precedence: `notificationType()` > class-level `@Notification({ name })` > class name. The async dispatch rehydration registry is unaffected — it still keys strictly off the class-level name, since an instance-level type is data, not a class identity.

  Add `emitter?: boolean` to `NotificationsModule.forRoot`/`forRootAsync` options. When `true`, the module registers `EventEmitterModule.forRoot()` for you (core's `ChannelRunner` injects `EventEmitter2` regardless of this flag, so something has to call it). Defaults to `false` — an app that already calls `EventEmitterModule.forRoot()` elsewhere must not register it twice — so today's explicit-wiring behavior is unchanged unless you opt in.

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

### Patch Changes

- 0048cb5: perf: cache reflect-metadata per notification class — `WeakMap`-cache the channel handler map, the `@Inject` dependency list (with an empty no-op fast path), and the tenant field key. The dynamic `via()` path and per-instance tenant value resolution are unchanged.

## 0.6.0

### Minor Changes

- 851170c: Capture the triggering request context on `send()`. When the optional `@dudousxd/nestjs-context` peer is installed and its accessor is bound (soft-detected via the shared `CONTEXT_ACCESSOR` symbol — no hard import), `NotificationService.send()` snapshots `{ causer, tenantId, traceId }` and threads it through the delivery lifecycle as `DeliveryContext.captured`, onto the `NotificationSendingEvent`/`NotificationSentEvent`/`NotificationFailedEvent` lifecycle events, and into the `NotificationJob`/`SerializedJob` carrier so it survives async dispatch. Fully additive and opt-in: with no accessor present, behaviour is unchanged.

## 0.5.0

### Minor Changes

- 67db54f: Add ad-hoc channel filtering to sends — `notifications.only([...])` / `notifications.except([...])`, composable with `forTenant`. Enrich the `notification.sent` / `notification.failed` events with the tenant, delivery duration (ms), and the channel's response.

## 0.4.0

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

## 0.3.0

### Minor Changes

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
