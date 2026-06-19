import {
  InMemoryResilienceStore,
  circuitBreaker,
  failover,
  timeout,
  wrap,
} from '@dudousxd/nestjs-resilience';
import type { Clock, EventSink, ResilienceStore } from '@dudousxd/nestjs-resilience';

/** A transport (any provider) tagged with a stable id used as its circuit-breaker key. */
export interface ResilientTransportEntry<T> {
  /** Stable provider id, e.g. `'twilio'`, `'vonage'`. Becomes the circuit key `<keyPrefix>:<id>`. */
  id: string;
  transport: T;
}

export interface ResilientBreakerOptions {
  /** Consecutive failures before a provider's circuit opens. */
  threshold: number;
  /** How long a provider's circuit stays open before a half-open probe, in ms. */
  cooldownMs: number;
  /** Max concurrent half-open probes per provider. Default 1. */
  halfOpenMax?: number;
}

export interface ResilientTransportOptions {
  /** Circuit-breaker state store. Default: a private in-memory store (per-process). Pass a
   *  distributed @dudousxd/nestjs-resilience-store-* adapter to share breaker state fleet-wide. */
  store?: ResilienceStore;
  /** Clock seam for the timeout policy and the default store (inject a FakeClock in tests). */
  clock?: Clock;
  /** Per-attempt timeout per provider, in ms. A timeout counts as a provider failure. Default 10000. */
  timeoutMs?: number;
  /** Per-provider circuit breaker. Default `{ threshold: 5, cooldownMs: 30000 }`. */
  breaker?: ResilientBreakerOptions;
  /** Prefix for circuit keys, e.g. `'sms'` → `'sms:twilio'`. */
  keyPrefix?: string;
  /** Called once per provider that fails (or short-circuits), before falling over to the next. */
  onFailover?: (id: string, error: unknown, index: number) => void;
  /** Resilience event sink (diagnostics / event-emitter bridge). */
  onEvent?: EventSink;
}

/** A transport that delivers a payload, throwing on failure (the nestjs-notifications contract). */
export interface ResilientTransport<P> {
  send(payload: P): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BREAKER: ResilientBreakerOptions = Object.freeze({ threshold: 5, cooldownMs: 30_000 });

/**
 * Wrap an ordered list of provider transports into a single resilient transport.
 *
 * Each `send` tries the providers in order; every attempt is wrapped in a per-provider circuit
 * breaker (outer) and a per-attempt timeout (inner). An open breaker short-circuits instantly so a
 * known-dead provider is skipped without a wasted call, and a slow provider that exceeds `timeoutMs`
 * is treated as a failure and tripped toward the breaker. The first provider that succeeds stops the
 * chain; if all fail, the last error is thrown. State transitions emit on `onEvent` (resilience
 * diagnostics).
 *
 * Generic over any transport with `send(payload): Promise<void>` — works for `MailTransport`,
 * `SmsTransport`, or any custom transport. Drops into a channel module's `transportInstance`.
 */
export function resilientTransport<P, T extends { send(payload: P): Promise<void> }>(
  entries: ResilientTransportEntry<T>[],
  opts: ResilientTransportOptions = {},
): ResilientTransport<P> {
  if (entries.length === 0) {
    throw new Error('resilientTransport() needs at least one transport.');
  }
  const store = opts.store ?? new InMemoryResilienceStore(opts.clock);
  const breaker = opts.breaker ?? DEFAULT_BREAKER;
  const prefix = opts.keyPrefix ? `${opts.keyPrefix}:` : '';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutOpts = opts.clock ? { clock: opts.clock } : {};
  const onEvent = opts.onEvent;
  const onFailover = opts.onFailover;

  return {
    send: (payload: P): Promise<void> =>
      failover<ResilientTransportEntry<T>, void>({
        targets: entries,
        run: (entry) => entry.transport.send(payload),
        policy: (entry) =>
          wrap(
            circuitBreaker({
              key: `${prefix}${entry.id}`,
              store,
              threshold: breaker.threshold,
              cooldownMs: breaker.cooldownMs,
              ...(breaker.halfOpenMax !== undefined ? { halfOpenMax: breaker.halfOpenMax } : {}),
              ...(onEvent ? { onEvent } : {}),
            }),
            timeout(timeoutMs, timeoutOpts),
          ),
        ...(onFailover
          ? {
              onFailover: (entry: ResilientTransportEntry<T>, error: unknown, index: number) =>
                onFailover(entry.id, error, index),
            }
          : {}),
        ...(onEvent ? { onEvent } : {}),
      }),
  };
}
