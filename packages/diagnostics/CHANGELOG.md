# @dudousxd/nestjs-notifications-diagnostics

## 0.1.0

### Minor Changes

- b6cd69f: Add `@dudousxd/nestjs-notifications-diagnostics`: bridge the core notification lifecycle events onto the Aviary diagnostics bus (`aviary:notifications:{sending,sent,failed}`). Ships `attachNotificationsDiagnostics(emitter)`, a global `NotificationsDiagnosticsModule`, and a typed `ChannelRegistry` augmentation so `@OnDiagnostic('notifications', ...)` infers the event-class payload. Propagates `captured.traceId` onto the diagnostic envelope.
