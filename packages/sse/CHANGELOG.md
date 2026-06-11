# @dudousxd/nestjs-notifications-sse

## 0.4.0

### Minor Changes

- 4c9c2ea: Add `SseChannelModule.forRootAsync({ useFactory, inject })` so the cross-pod `backplane` (and event name) can be built from DI — e.g. constructing a `RedisSseBackplane` from your app's Redis config service.
- e3fbd5e: Add `createNotificationsStreamController({ resolveRoute, resolveTenant?, path?, streamPath?, heartbeatMs? })` — a factory that mounts the native `@Sse()` streaming endpoint (subscribing to `SseHub` under the channel's `sseKey`), with a built-in heartbeat, so apps don't hand-write the SSE endpoint.

## 0.3.0

### Minor Changes

- 276c1dc: Add a pluggable cross-pod backplane to the SSE channel. The hub is in-process by default; pass a `backplane` to `SseChannelModule.forRoot` (e.g. the bundled `RedisSseBackplane`, an `ioredis`-based pub/sub fan-out) so a publish on any node reaches the SSE connections on every node — for deployments where the writer and the node holding the connection are different processes.
