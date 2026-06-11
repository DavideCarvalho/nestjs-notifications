# @dudousxd/nestjs-notifications-push

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
