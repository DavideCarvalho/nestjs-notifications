---
"@dudousxd/nestjs-notifications-resilience": minor
---

**Breaking.** `resilientTransport()` builds on `@nestjs/resilience` (peer ~0.0.3, Nest `^12`); `@dudousxd/nestjs-resilience` is no longer used (it is deprecated).

- Each provider gets `ResiliencePolicy.wrap(new CircuitBreakerPolicy({ name: '<keyPrefix>:<id>', ...breaker }), new TimeoutPolicy(timeout))`, built once; breaker state is in-process. The ordered failover is this package's: an open circuit (`CircuitOpenError`) or a timeout (`ResilienceTimeoutError`) always fails over, other errors when `failoverIf(error)` allows (default: all); the last error is rethrown.
- Options: `breaker` takes `@nestjs/resilience`'s `CircuitBreakerOptions` (`failureRateThreshold`, `minimumCalls`, `slidingWindow`, `openDuration`, `halfOpenMaxCalls`, `recordIf`); `timeout` takes a `Duration` (default `'10s'`); new `failoverIf`.
- Removed: `store`/`ResilienceStore` (no fleet-wide breaker), `clock`, `onEvent` (subscribe to the `nestjs:resilience:*` channels), `timeoutMs`, `{ threshold, cooldownMs, halfOpenMax }`, the `ResilientTransport<P>` interface (now a class exposing `breakers` and `close()`).
- `send()` keeps the wrapped transport's arguments and result, so it fits `@nestjs/mail` transports; an options object's `signal` is combined with the attempt's timeout signal.

Migration: `pnpm remove @dudousxd/nestjs-resilience && pnpm add @nestjs/resilience`; `timeoutMs: 8000` → `timeout: '8s'`; `breaker: { threshold: 5, cooldownMs: 30000 }` → `breaker: { minimumCalls: 5, slidingWindow: { type: 'count', size: 5 }, failureRateThreshold: 100, openDuration: '30s' }` (or the rate-based defaults); drop `store`, `clock`, `onEvent`.
