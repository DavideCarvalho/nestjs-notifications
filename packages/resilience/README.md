# @dudousxd/nestjs-notifications-resilience

Resilient **provider failover** for [nestjs-notifications](https://github.com/DavideCarvalho/nestjs-notifications) — try SMS via Twilio → Vonage, or mail via SES → Resend, with a **per-provider circuit breaker**, a **per-attempt timeout**, and ordered failover. Powered by [`@dudousxd/nestjs-resilience`](https://www.npmjs.com/package/@dudousxd/nestjs-resilience).

It replaces the legacy stateless `FailoverSmsTransport` / `FailoverMailTransport`, which retried a dead provider on every send and had no per-attempt timeout.

## Install

```bash
pnpm add @dudousxd/nestjs-notifications-resilience @dudousxd/nestjs-resilience
```

`@dudousxd/nestjs-resilience` and `@nestjs/common` are peer dependencies.

## Usage

`resilientTransport()` wraps an ordered list of transports into a single transport implementing the
same `send(payload)` contract, so it drops into a channel module's `transportInstance`:

```ts
import { SmsChannelModule, TwilioTransport, VonageTransport } from '@dudousxd/nestjs-notifications-sms';
import { resilientTransport } from '@dudousxd/nestjs-notifications-resilience';

SmsChannelModule.forRoot({
  transportInstance: resilientTransport(
    [
      { id: 'twilio', transport: twilio },
      { id: 'vonage', transport: vonage },
    ],
    {
      keyPrefix: 'sms',                                  // circuit keys: 'sms:twilio', 'sms:vonage'
      timeoutMs: 8_000,                                  // per-attempt timeout
      breaker: { threshold: 5, cooldownMs: 30_000 },     // open after 5 failures, probe after 30s
    },
  ),
});
```

For each `send`, providers are tried in order. Every attempt is wrapped in a per-provider **circuit
breaker** (an open breaker short-circuits instantly, so a known-dead provider is skipped without a
wasted call) and a per-attempt **timeout** (a slow provider that exceeds `timeoutMs` is treated as a
failure and trips the breaker). The first provider that succeeds stops the chain.

It is generic over any transport with `send(payload): Promise<void>` — `SmsTransport`,
`MailTransport`, or your own.

## Fleet-wide breaker state

By default the circuit-breaker state is per-process (in-memory). To share it across your fleet, pass
any [`@dudousxd/nestjs-resilience-store-*`](https://www.npmjs.com/package/@dudousxd/nestjs-resilience)
adapter (Redis / Postgres via TypeORM, MikroORM, Prisma, or SQLite via Drizzle):

```ts
import { RedisResilienceStore } from '@dudousxd/nestjs-resilience-store-redis';

resilientTransport(entries, { keyPrefix: 'sms', store: new RedisResilienceStore(redis) });
```

Circuit keys are tenant-scoped automatically when `@dudousxd/nestjs-context` is present (both libraries
share the `Symbol.for('@dudousxd/nestjs-context:accessor')` accessor).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `store` | in-memory (per-process) | A `ResilienceStore` for breaker state. Pass a distributed adapter to share it fleet-wide. |
| `timeoutMs` | `10000` | Per-attempt timeout per provider. A timeout counts as a failure. |
| `breaker` | `{ threshold: 5, cooldownMs: 30000 }` | Per-provider circuit breaker. Optional `halfOpenMax` (default 1). |
| `keyPrefix` | — | Prefix for circuit keys, e.g. `'sms'` → `'sms:twilio'`. |
| `onFailover` | — | `(id, error, index)` — called per failed/short-circuited provider before falling over. |
| `onEvent` | — | Resilience event sink (diagnostics / `@nestjs/event-emitter` bridge). |
| `clock` | system clock | Clock seam for timeout + the default store (inject a `FakeClock` in tests). |

## Scope & limits

- **Provider failover within a channel** (this package). Cross-channel escalation (WhatsApp → SMS →
  mail) remains the core `runFallbackChain` / `DeliveryConfirmation` — a separate concern.
- **Duplicate sends:** a per-provider circuit breaker *reduces* duplicate-send risk on dispatcher
  (e.g. BullMQ) retries by skipping a now-open provider. The "succeeded-but-reported-failed" case is
  the confirmation/wait-based path and is out of scope; pair failover with the idempotency
  dispatch-guard for effectively-once semantics.

## Development note (pre-publish)

Until `@dudousxd/nestjs-resilience` is published to npm, this package's `@dudousxd/nestjs-resilience`
**devDependency** is an interim local `file:` link to the sibling `nestjs-resilience` repo (so it can
build and test in this monorepo). The shipped **peerDependency** already targets the published range
`>=0.1.0 <1.0.0`. Before publishing this package — and before relying on a fresh-clone install — publish
`@dudousxd/nestjs-resilience` and change the devDependency to the published version (`^0.1.0`).
