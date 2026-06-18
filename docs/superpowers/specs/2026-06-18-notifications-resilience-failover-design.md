# nestjs-notifications × nestjs-resilience: provider failover integration — design spec

**Status:** Draft for review. Implementation is gated on (1) approval of this design and (2) the cross-repo dependency decision in §7.

## 1. Motivation

`nestjs-notifications` today does provider failover within a channel (e.g. SMS Twilio → Vonage → SNS) with a **naive, stateless** primitive:

- `failover(providers, attempt, onFailover)` in `packages/core/src/failover.ts` — try-in-order, rethrow last error.
- `FailoverSmsTransport` / `FailoverMailTransport` wrappers (`packages/{sms,mail}/src/transport.ts`), registered via `transportInstance`.

Known weaknesses (from the original brainstorm): **stateless** (a dead provider is retried on every send — no circuit breaker), **no per-attempt timeout** (only triggers on throw, never on slowness), **duplicate-send risk** that compounds with BullMQ job-level retries, and a `transportInstance` API that loses DI/module-option wiring.

`@dudousxd/nestjs-resilience` (now built, with in-memory + Redis + TypeORM/MikroORM/Prisma/Drizzle stores) solves exactly these: composable `timeout`/`retry`/`circuitBreaker`/`wrap` policies and a list-oriented `failover({ targets, run, policy, onFailover, onEvent })` over a pluggable, fleet-wide `ResilienceStore`.

**Goal:** replace the naive notifications failover with a resilience-backed one — per-provider circuit breaker + per-attempt timeout + ordered failover — while preserving the existing transport interface and registration ergonomics. Scope is **A (synchronous failover)**; the confirmation/wait-based cross-channel escalation ("B") stays the existing `runFallbackChain` and a future durable-workflow concern.

## 2. Scope

**In scope:** within-channel **provider** failover (the `FailoverSmsTransport`/`FailoverMailTransport` replacement) backed by resilience policies and a `ResilienceStore`.

**Out of scope (unchanged):** cross-channel fallback (`runFallbackChain`/`DeliveryConfirmation`) — a separate concern; BullMQ job-level retry/backoff/DLQ; idempotency/throttle dispatch-guards. The integration cooperates with these (see §6) but does not modify them.

## 3. Architecture

A new, channel-agnostic package **`@dudousxd/nestjs-notifications-resilience`** exporting a generic builder that wraps an ordered list of transports into a single resilient transport implementing the same `send(payload): Promise<void>` contract — so it drops into `transportInstance` exactly where the old failover transports went.

```ts
// @dudousxd/nestjs-notifications-resilience
import { wrap, timeout, circuitBreaker, failover, InMemoryResilienceStore } from '@dudousxd/nestjs-resilience';
import type { ResilienceStore } from '@dudousxd/nestjs-resilience';

export interface ResilientTransportEntry<T> {
  /** A stable provider id used as the circuit-breaker key, e.g. 'twilio', 'vonage'. */
  id: string;
  transport: T;
}

export interface ResilientTransportOptions {
  store?: ResilienceStore;            // default: a shared InMemoryResilienceStore
  timeoutMs?: number;                 // per-attempt timeout; default e.g. 10_000
  breaker?: { threshold: number; cooldownMs: number; halfOpenMax?: number }; // per-provider CB
  keyPrefix?: string;                 // e.g. 'sms' -> circuit keys 'sms:twilio'
  onFailover?: (id: string, error: unknown, index: number) => void;
  onEvent?: import('@dudousxd/nestjs-resilience').EventSink; // diagnostics/event-emitter bridge
}

/** Generic over any transport with `send(payload): Promise<void>` (MailTransport, SmsTransport, …). */
export function resilientTransport<P, T extends { send(payload: P): Promise<void> }>(
  entries: ResilientTransportEntry<T>[],
  opts: ResilientTransportOptions = {},
): { send(payload: P): Promise<void> } {
  const store = opts.store ?? new InMemoryResilienceStore();
  const breaker = opts.breaker ?? { threshold: 5, cooldownMs: 30_000 };
  const prefix = opts.keyPrefix ? `${opts.keyPrefix}:` : '';
  return {
    send: (payload: P) =>
      failover({
        targets: entries,
        run: (e) => e.transport.send(payload),
        policy: (e) =>
          wrap(
            timeout(opts.timeoutMs ?? 10_000),
            circuitBreaker({ key: `${prefix}${e.id}`, store, ...breaker, onEvent: opts.onEvent }),
          ),
        onFailover: opts.onFailover && ((e, err, i) => opts.onFailover?.(e.id, err, i)),
        onEvent: opts.onEvent,
      }),
  };
}
```

Behaviour: for each `send`, providers are tried in order; each attempt is wrapped in `timeout(perAttempt)` and a **per-provider circuit breaker**. An open breaker short-circuits instantly (no wasted call to a known-dead provider) and failover moves to the next. A successful send stops the chain. All transitions emit on the resilience diagnostics channel `aviary:resilience:*` and, if wired, the `@nestjs/event-emitter` mirror.

This is a thin composition — all logic lives in the resilience lib; the notifications package only adapts the `{id, transport}` shape and the `send(payload)` contract.

## 4. Channel ergonomics (DI-friendly, replacing `transportInstance`)

`transportInstance` works but loses DI. Two consumption surfaces:

1. **Direct (today's pattern, improved):**
   ```ts
   SmsChannelModule.forRoot({
     transportInstance: resilientTransport(
       [{ id: 'twilio', transport: twilio }, { id: 'vonage', transport: vonage }],
       { keyPrefix: 'sms', timeoutMs: 8000, breaker: { threshold: 5, cooldownMs: 30_000 }, store },
     ),
   });
   ```
2. **Async/DI (recommended):** add a small `resolveTransport`-friendly factory and document `forRootAsync`-style wiring so the `ResilienceStore` (e.g. the Redis adapter) and per-tenant transports come from DI:
   ```ts
   SmsChannelModule.forRootAsync({
     inject: [RESILIENCE_STORE, TWILIO, VONAGE],
     useFactory: (store, twilio, vonage) => ({
       transportInstance: resilientTransport([...], { store, keyPrefix: 'sms' }),
     }),
   });
   ```
   (`SmsChannelModule.forRootAsync` may need to be added if absent — confirm during planning.)

Per-tenant: `resilientTransport` can be built inside a `resolveTransport(tenant)` callback; the circuit-breaker keys are already tenant-scoped by the resilience lib via the shared `CONTEXT_ACCESSOR` (`Symbol.for('@dudousxd/nestjs-context:accessor')`) — both repos use the same symbol, so tenant isolation is automatic when `@dudousxd/nestjs-context` is present.

## 5. Replacing the old failover

Since nobody depends on it yet (per the original decision), **remove** `FailoverSmsTransport`, `FailoverMailTransport`, and the core `failover()` primitive (or deprecate with a re-export shim that delegates to `resilientTransport` for one release). The new package is the single failover story. The cross-channel `runFallbackChain` is untouched.

## 6. Cooperation with retries / dedup (duplicate-send)

- **BullMQ job-level retry** re-runs the whole channel chain. The per-provider circuit breaker actually *reduces* duplicate-send risk: on a retry, a now-open provider is skipped instead of re-attempted. But a "succeeded-at-provider-but-reported-failed" send remains the classic duplicate problem — that is the confirmation-based **B** path, explicitly deferred. Document this boundary.
- **Idempotency guard:** recommend pairing failover with the existing idempotency dispatch-guard for at-least-once→effectively-once semantics; the integration does not change the guard.
- Resilience `retry` policy is **NOT** stacked on top of BullMQ retry by default (would compound). Per-attempt `timeout` + failover + CB is the default; an optional in-attempt `retry` is opt-in per provider.

## 7. Cross-repo dependency — THE decision that blocks implementation

`nestjs-notifications` and `nestjs-resilience` are **separate repos / separate pnpm workspaces**. `@dudousxd/nestjs-resilience` is **not yet published**. The new package cannot `workspace:` depend on it. Options:

- **(A) Publish `@dudousxd/nestjs-resilience` (+ store adapters) to npm first**, then `nestjs-notifications-resilience` depends on the published version. Cleanest for consumers; requires a real release (CI + changesets + `NPM_TOKEN` secret — NOT a chat-pasted token). Recommended, but is an outward-facing release that needs explicit go-ahead.
- **(B) Local `file:`/`link:` dependency** to `../nestjs-resilience/packages/core` (+ adapters) for development only. Unblocks building/testing the integration locally without publishing, but is not shippable as-is.
- **(C) Vendor/move resilience into the notifications monorepo.** Avoids cross-repo entirely but duplicates the lib and abandons its standalone identity (contradicts the decision to build it as its own ecosystem package).

This is a genuine decision (and (A) involves publishing, which must be explicitly authorized). Implementation proceeds once chosen.

## 8. Testing

- Unit: `resilientTransport` with fake transports — first-success short-circuits; provider failure → next tried; per-provider CB opens after threshold and short-circuits subsequent sends; per-attempt timeout rejects a slow provider and fails over; events emitted. Use the resilience `FakeClock` for deterministic CB/timeout.
- Integration: register via `SmsChannelModule`/`MailChannelModule` `transportInstance`, send through `NotificationService`, assert the right provider was used and CB state evolves. Mirror the existing `failover.spec.ts` cases, plus the new CB/timeout cases the old primitive couldn't express.
- The resilience store contract is already validated in the resilience repo; here we only test the adapter/composition.

## 9. Deliverables (post-approval)

1. New package `@dudousxd/nestjs-notifications-resilience` (`resilientTransport` + options + DI helpers + README + changeset).
2. Removal/deprecation of the naive `failover()` + `Failover{Sms,Mail}Transport`.
3. Docs: a "Resilient provider failover" page showing CB + timeout + per-tenant + fleet-wide (Redis store) wiring, and the duplicate-send/idempotency boundary.
4. (If §7-A) the resilience release that this depends on.

## Open questions for review
1. **§7 dependency strategy** (A publish / B file-link / C monorepo-move) — blocks implementation; (A) needs publish authorization.
2. Package placement: one channel-agnostic `nestjs-notifications-resilience` (recommended) vs. baking resilient failover into `mail`/`sms` directly.
3. Remove vs deprecate-with-shim the old `failover()`/`Failover*Transport`.
4. Default policy values (per-attempt `timeoutMs`, breaker `threshold`/`cooldownMs`).
