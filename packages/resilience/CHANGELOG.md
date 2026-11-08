# @dudousxd/nestjs-notifications-resilience

## 0.3.0

### Minor Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - **Breaking.** `resilientTransport()` builds on `@nestjs/resilience` (peer ~0.0.3, Nest `^12`); `@dudousxd/nestjs-resilience` is no longer used (it is deprecated).

  - Each provider gets `ResiliencePolicy.wrap(new CircuitBreakerPolicy({ name: '<keyPrefix>:<id>', ...breaker }), new TimeoutPolicy(timeout))`, built once; breaker state is in-process. The ordered failover is this package's: an open circuit (`CircuitOpenError`) or a timeout (`ResilienceTimeoutError`) always fails over, other errors when `failoverIf(error)` allows (default: all); the last error is rethrown.
  - Options: `breaker` takes `@nestjs/resilience`'s `CircuitBreakerOptions` (`failureRateThreshold`, `minimumCalls`, `slidingWindow`, `openDuration`, `halfOpenMaxCalls`, `recordIf`); `timeout` takes a `Duration` (default `'10s'`); new `failoverIf`.
  - Removed: `store`/`ResilienceStore` (no fleet-wide breaker), `clock`, `onEvent` (subscribe to the `nestjs:resilience:*` channels), `timeoutMs`, `{ threshold, cooldownMs, halfOpenMax }`, the `ResilientTransport<P>` interface (now a class exposing `breakers` and `close()`).
  - `send()` keeps the wrapped transport's arguments and result, so it fits `@nestjs/mail` transports; an options object's `signal` is combined with the attempt's timeout signal.

  Migration: `pnpm remove @dudousxd/nestjs-resilience && pnpm add @nestjs/resilience`; `timeoutMs: 8000` → `timeout: '8s'`; `breaker: { threshold: 5, cooldownMs: 30000 }` → `breaker: { minimumCalls: 5, slidingWindow: { type: 'count', size: 5 }, failureRateThreshold: 100, openDuration: '30s' }` (or the rate-based defaults); drop `store`, `clock`, `onEvent`.

### Patch Changes

- [#123](https://github.com/DavideCarvalho/nestjs-notifications/pull/123) [`ee86c5c`](https://github.com/DavideCarvalho/nestjs-notifications/commit/ee86c5ca946ece15f5213beb475eda81514b667d) Thanks [@DavideCarvalho](https://github.com/DavideCarvalho)! - Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.

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
