# @dudousxd/nestjs-notifications-resilience

## 0.2.1

### Patch Changes

- c68e5b3: Add NestJS 12 to the supported peer range.

  Every `@nestjs/*` peer that read `^10.0.0 || ^11.0.0` now also admits `^12.0.0`, and the
  `@nestjs/event-emitter` peer — which NestJS 12 renumbered from the 3.x line onto the framework's
  own 12.x line — reads `^2.0.0 || ^3.0.0 || ^12.0.0`. Installing on NestJS 12 no longer trips a peer
  warning; hosts on 10 or 11 are unaffected.

  The satellite peers move with it: `@nestjs/websockets` and `@nestjs/platform-socket.io`
  (broadcast), `@nestjs/bullmq` (bullmq) and `@nestjs/typeorm` (database-typeorm) all have a 12.x
  release, so none of them holds a package back.

  One source change was needed, in `sse`. NestJS 12 widened `MessageEvent['data']` to include
  `undefined`, so under `exactOptionalPropertyTypes` the hub's cast no longer satisfied the
  `Subject<MessageEvent>` it feeds; the cast is now `NonNullable<MessageEvent['data']>`. Runtime
  behaviour is unchanged — the backplane never publishes an undefined payload.

  Nothing else in the source needed touching. NestJS 12 ships its core packages as pure ESM and these
  libraries are already `"type": "module"`, and none of them implements a `PipeTransform` or
  subclasses `ConsoleLogger` — the two v12 signature changes that would otherwise have reached
  library code. The test suite runs against `@nestjs/common` 12.0.1.

## 0.2.0

### Minor Changes

- f379cf8: Add `@dudousxd/nestjs-notifications-resilience` — `resilientTransport()` wraps an ordered list of provider transports with a per-provider circuit breaker, a per-attempt timeout, and ordered failover (powered by `@dudousxd/nestjs-resilience`), with optional fleet-wide breaker state via the resilience store adapters. Drops into a channel's `transportInstance`.

  BREAKING: removed the legacy stateless failover (`FailoverSmsTransport`, `FailoverMailTransport`, and the core `failover()` / `FailoverListener`). They had no circuit breaker and no per-attempt timeout — use `resilientTransport()` instead.
