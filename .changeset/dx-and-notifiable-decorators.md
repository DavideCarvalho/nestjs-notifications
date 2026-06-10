---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-testing": minor
"@dudousxd/nestjs-notifications-mail": patch
"@dudousxd/nestjs-notifications-sms": patch
"@dudousxd/nestjs-notifications-slack": patch
"@dudousxd/nestjs-notifications-webhook": patch
"@dudousxd/nestjs-notifications-push": patch
"@dudousxd/nestjs-notifications-broadcast": patch
"@dudousxd/nestjs-notifications-database": patch
---

Core DX overhaul (all additive):

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
