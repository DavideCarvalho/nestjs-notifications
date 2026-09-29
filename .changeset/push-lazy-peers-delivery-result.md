---
"@dudousxd/nestjs-notifications-push": minor
---

Optional peer SDKs are lazy-loaded, and `PushChannel.send()` now returns a delivery result.

- Importing `@dudousxd/nestjs-notifications-push` no longer requires every optional peer (`web-push`, `firebase-admin`, `expo-server-sdk`, `@parse/node-apn`). Each built-in transport loads its SDK on first send. A missing SDK now fails with a clear "install `<sdk>`" error at that point, not at import time. Apps using `PushChannel` with their own `PushTransport` need none of them. The root exports are unchanged.
- `PushChannel.send()` resolves to a `PushDeliveryResult` (`{ targets, delivered, invalidTargets, failures }`), surfaced as the push `ChannelResult.response`, in `afterSending` and on `notification.sent`.
- Per-target errors are no longer silently dropped. `BatchSendResult` gains optional `failures`: FCM reports non-dead-token errors there and Expo reports non-`DeviceNotRegistered` ticket errors. Without `sendMany`, every target is now attempted: one failure no longer aborts the rest, and it is collected instead. When no target was delivered and at least one failed, the channel throws `PushDeliveryError` (with `.failures`), so the delivery is marked `failed`. A single-target send still propagates the transport's error.
- The built-in transports' SDK clients (VAPID details, Firebase app, Expo client, APNs provider) are now set up lazily on first send, not in the constructor.
