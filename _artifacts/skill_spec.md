# Skill spec — nestjs-notifications

Autonomous compressed discovery (no maintainer interview). Scope bounded to the 1–3 primary
client-facing packages a consumer actually imports first: **core**, **mail**, **testing**.
Flat structure, no router skill, each skill type `core` (each < 5 sibling skills).

## Chosen skills

| Skill | Package | Path | Why |
| --- | --- | --- | --- |
| `notifications-core` | core | packages/core/skills/notifications-core/SKILL.md | The entry point: module setup, defining a Notification + Notifiable, sending, on-demand routing, channel inference vs `via()`. Everything else builds on it. |
| `notifications-async-dispatch` | core | packages/core/skills/notifications-async-dispatch/SKILL.md | Distinct topic with its own sharp edges: `shouldQueue`/`delay`, picking a dispatcher, the `{name,data}`+`{type,id}` serialization contract, `notifications`/`resolveNotifiable`. Most agent mistakes live here. |
| `notifications-mail` | mail | packages/mail/skills/notifications-mail/SKILL.md | The most-used channel: `MailChannelModule.forRoot`, fluent `MailMessage`, `MailNotification`, renderers, transports. |
| `notifications-testing` | testing | packages/testing/skills/notifications-testing/SKILL.md | `NotificationFake` + Laravel-style assertions; how to swap it into a Nest test module. |

## Grounding sources (all read in full)
- README.md (package table, quick start, async, telescope, testing)
- packages/core/src: index.ts, interfaces.ts, notification.service.ts, decorators.ts, options.ts,
  notifications.module.ts, events.ts, errors.ts, base-channel.ts, pending-notification.ts
- packages/mail/src: index.ts, mail-message.ts, mail.module.ts, mail.channel.ts, renderer.ts, transport.ts
- packages/testing/src: index.ts, notification-fake.ts, provide-notification-fake.ts
- packages/event-emitter/src: event-emitter.dispatcher.ts; packages/bullmq/src: bullmq-dispatcher.helper.ts, index.ts
- examples/basic/src: app.module.ts, user.ts, notifications/invoice-paid.notification.ts

## Common-mistake mining (grounded failure modes)
- Routing a channel whose module was never imported -> `ChannelNotRegisteredError` ("Did you forget to import the channel's module?").
- Decorating with a channel handle but missing the payload method -> `MissingChannelMethodError`.
- Forgetting `EventEmitterModule.forRoot()` (core peer-depends on @nestjs/event-emitter; lifecycle events break without it).
- `shouldQueue` without `notifications: [...]` + `resolveNotifiable` on a cross-process dispatcher -> rehydration fails (NotificationSerializationError) / silent worker error.
- Expecting `send()` to throw on channel failure: it returns `SendResult[]` with per-channel `status` ('continueOnError' default).
- Newing a notification means Nest does NOT inject it — property `@Inject` is filled by the library at delivery time only for registered providers.
- Using the real `NotificationService` in tests and asserting on a live transport instead of `NotificationFake`.
- Mail: putting `.markdown()`/`.react()` body but leaving the `DefaultMailRenderer`, which ignores them.

## Remaining Gaps (would need a maintainer interview)
See `gaps:` in `_artifacts/domain_map.yaml`. Summary:
1. Channel priority beyond core/mail/testing inferred from README, not confirmed.
2. AI-agent failure modes derived from source error classes + serializer contract, not from triaged issues (gh search not confirmed available).
3. No telemetry on most-used renderer/transport; mail skill follows README quick-start defaults.
4. Whether @nestjs/event-emitter is strictly mandatory or has a fallback path.
5. Advanced surfaces (Redis dispatcher, preferences/quiet-hours/digest gates, localization, fallback chains, telescope/diagnostics, client/react/codegen) intentionally excluded from the focused set — a maintainer may want dedicated skills.
6. Exact runtime NestJS version matrix not independently verified.

## Uncovered public packages (listed in structured output `gaps`)
All `secondary_packages` in the domain map — every channel package except mail, all dispatcher
packages, preferences, delivery-tracking, resilience, diagnostics, telescope, client, react, codegen,
and the database adapters. They are publishable and consumer-facing but share the core/mail patterns.
