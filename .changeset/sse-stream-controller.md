---
'@dudousxd/nestjs-notifications-sse': minor
---

Add `createNotificationsStreamController({ resolveRoute, resolveTenant?, path?, streamPath?, heartbeatMs? })` — a factory that mounts the native `@Sse()` streaming endpoint (subscribing to `SseHub` under the channel's `sseKey`), with a built-in heartbeat, so apps don't hand-write the SSE endpoint.
