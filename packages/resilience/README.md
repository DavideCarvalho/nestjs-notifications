# @dudousxd/nestjs-notifications-resilience

Provider **failover** for [nestjs-notifications](https://github.com/DavideCarvalho/nestjs-notifications):
try SMS via Twilio → Vonage, or mail via SES → Resend. Each provider runs behind
[`@nestjs/resilience`](https://docs.nestjs.com/reliability/resilience)'s `CircuitBreakerPolicy` and
`TimeoutPolicy`; this package adds the ordered failover across providers.

## Install

```bash
pnpm add @dudousxd/nestjs-notifications-resilience @nestjs/resilience
```

`@nestjs/resilience` (~0.0.3) and `@nestjs/common` (^12) are peer dependencies.

## Usage

`resilientTransport()` wraps an ordered list of transports into one transport with the same `send()`
(arguments and result pass through), so it drops into an SMS channel's `transportInstance` or
`@nestjs/mail`'s `MailModule.forRoot({ transport })`:

```ts
import { resilientTransport } from '@dudousxd/nestjs-notifications-resilience';

SmsChannelModule.forRoot({
  transportInstance: resilientTransport(
    [
      { id: 'twilio', transport: twilio },
      { id: 'vonage', transport: vonage },
    ],
    {
      keyPrefix: 'sms',                                   // breakers 'sms:twilio', 'sms:vonage'
      timeout: '8s',                                      // per attempt
      breaker: { failureRateThreshold: 50, minimumCalls: 5, openDuration: '30s' },
    },
  ),
});
```

Each provider gets `ResiliencePolicy.wrap(new CircuitBreakerPolicy({ name, ...breaker }), new TimeoutPolicy(timeout))`,
built once. A send tries the providers in order:

- an open breaker rejects with `CircuitOpenError` without calling the provider;
- a provider slower than `timeout` fails with `ResilienceTimeoutError` (and counts toward its breaker);
- both always move on to the next provider; other errors do when `failoverIf(error)` says so (default: all);
- the first success wins; if every provider fails, the last error is thrown.

When the last argument is an options object with a `signal` (a `@nestjs/mail` transport's
`send(message, { signal })`), the attempt's timeout signal is combined into it, so the provider stops
on a timeout. `transport.breakers[id]` exposes each `CircuitBreakerPolicy` (`state`, `trip()`,
`reset()`); `close()` closes the wrapped transports.

Breaker state is in-process. State changes are published on the `nestjs:resilience:*` diagnostics
channels and `ResilienceEvents` (see the NestJS docs).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `timeout` | `'10s'` | Per-attempt timeout per provider (`Duration`: `'8s'` or ms). |
| `breaker` | `@nestjs/resilience` defaults | `CircuitBreakerOptions` without `name`: `failureRateThreshold`, `minimumCalls`, `slidingWindow`, `openDuration`, `halfOpenMaxCalls`, `recordIf`. |
| `keyPrefix` | — | Breaker name prefix, e.g. `'sms'` → `'sms:twilio'`. |
| `failoverIf` | every error | Which provider errors fail over (an open circuit and a timeout always do). |
| `onFailover` | — | `(id, error, index)`, called per failed or short-circuited provider before the next one. |

## Migrating from 0.2

`@dudousxd/nestjs-resilience` is deprecated; this package now builds on `@nestjs/resilience`.

| 0.2 | 0.3 |
| --- | --- |
| `pnpm add @dudousxd/nestjs-resilience` | `pnpm add @nestjs/resilience` |
| `timeoutMs: 8000` | `timeout: '8s'` (or `8000`) |
| `breaker: { threshold: 5, cooldownMs: 30000, halfOpenMax: 1 }` | `breaker: { minimumCalls: 5, slidingWindow: { type: 'count', size: 5 }, failureRateThreshold: 100, openDuration: '30s', halfOpenMaxCalls: 1 }` (consecutive-failure behavior), or the rate-based defaults |
| `store: new RedisResilienceStore(...)` | removed: breaker state is in-process |
| `clock: new FakeClock()` | removed: use fake timers (`vi.useFakeTimers()`) |
| `onEvent` | removed: subscribe to `nestjs:resilience:*` / `ResilienceEvents` |
| errors from `@dudousxd/nestjs-resilience` | `CircuitOpenError`, `ResilienceTimeoutError` from `@nestjs/resilience` |

## Scope

- Provider failover within a channel. Cross-channel escalation (WhatsApp → SMS → mail) is the core
  `runFallbackChain` / `DeliveryConfirmation`.
- A breaker reduces duplicate sends on dispatcher retries by skipping an open provider; pair failover
  with the idempotency dispatch guard (and `@nestjs/mail`'s `idempotencyKey`) for effectively-once sends.
