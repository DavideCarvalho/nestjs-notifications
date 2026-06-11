# @dudousxd/nestjs-notifications-sse

## 0.3.0

### Minor Changes

- 276c1dc: Add a pluggable cross-pod backplane to the SSE channel. The hub is in-process by default; pass a `backplane` to `SseChannelModule.forRoot` (e.g. the bundled `RedisSseBackplane`, an `ioredis`-based pub/sub fan-out) so a publish on any node reaches the SSE connections on every node — for deployments where the writer and the node holding the connection are different processes.
