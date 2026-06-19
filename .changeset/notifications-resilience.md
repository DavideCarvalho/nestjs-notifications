---
"@dudousxd/nestjs-notifications-resilience": minor
"@dudousxd/nestjs-notifications-sms": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-core": minor
---

Add `@dudousxd/nestjs-notifications-resilience` — `resilientTransport()` wraps an ordered list of provider transports with a per-provider circuit breaker, a per-attempt timeout, and ordered failover (powered by `@dudousxd/nestjs-resilience`), with optional fleet-wide breaker state via the resilience store adapters. Drops into a channel's `transportInstance`.

BREAKING: removed the legacy stateless failover (`FailoverSmsTransport`, `FailoverMailTransport`, and the core `failover()` / `FailoverListener`). They had no circuit breaker and no per-attempt timeout — use `resilientTransport()` instead.
