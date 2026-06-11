---
'@dudousxd/nestjs-notifications-sse': minor
---

Add `SseChannelModule.forRootAsync({ useFactory, inject })` so the cross-pod `backplane` (and event name) can be built from DI — e.g. constructing a `RedisSseBackplane` from your app's Redis config service.
