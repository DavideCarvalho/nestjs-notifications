---
"@dudousxd/nestjs-notifications-core": minor
---

Capture the triggering request context on `send()`. When the optional `@dudousxd/nestjs-context` peer is installed and its accessor is bound (soft-detected via the shared `CONTEXT_ACCESSOR` symbol — no hard import), `NotificationService.send()` snapshots `{ causer, tenantId, traceId }` and threads it through the delivery lifecycle as `DeliveryContext.captured`, onto the `NotificationSendingEvent`/`NotificationSentEvent`/`NotificationFailedEvent` lifecycle events, and into the `NotificationJob`/`SerializedJob` carrier so it survives async dispatch. Fully additive and opt-in: with no accessor present, behaviour is unchanged.
