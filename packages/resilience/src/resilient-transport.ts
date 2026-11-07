import {
  type CircuitBreakerOptions,
  CircuitBreakerPolicy,
  CircuitOpenError,
  type Duration,
  ResiliencePolicy,
  ResilienceTimeoutError,
  TimeoutPolicy,
} from '@nestjs/resilience';

/** Anything with a promise-returning `send()`: an SMS transport, a `@nestjs/mail` transport, yours. */
export type SendingTransport = { send(...args: any[]): Promise<unknown>; close?(): unknown };

/** A transport (any provider) tagged with a stable id, used to name its circuit breaker. */
export interface ResilientTransportEntry<T extends SendingTransport> {
  /** Stable provider id, e.g. `'twilio'`, `'vonage'`. The breaker is named `<keyPrefix>:<id>`. */
  id: string;
  transport: T;
}

/** `@nestjs/resilience`'s circuit breaker options; the name is derived from `keyPrefix` + id. */
export type ResilientBreakerOptions = Omit<CircuitBreakerOptions, 'name'>;

export interface ResilientTransportOptions {
  /** Per-attempt timeout per provider (`'8s'` or ms). A timeout counts as a provider failure. Default `'10s'`. */
  timeout?: Duration;
  /** Per-provider circuit breaker, `@nestjs/resilience`'s options. Default: its defaults. */
  breaker?: ResilientBreakerOptions;
  /** Prefix for breaker names, e.g. `'sms'` → `'sms:twilio'` (labels the `nestjs:resilience:*` events). */
  keyPrefix?: string;
  /**
   * Which provider errors move on to the next provider. An open circuit and a timeout always do.
   * Default: every error.
   */
  failoverIf?: (error: unknown) => boolean;
  /** Called once per provider that fails (or short-circuits), before falling over to the next. */
  onFailover?: (id: string, error: unknown, index: number) => void;
}

const DEFAULT_TIMEOUT: Duration = '10s';

/**
 * The transport {@link resilientTransport} returns: the wrapped transports' `send()`, failing over
 * across providers. `breakers` exposes each provider's `CircuitBreakerPolicy` (state, `trip()`,
 * `reset()`) for health checks and tests.
 */
export class ResilientTransport<T extends SendingTransport> {
  readonly breakers: Readonly<Record<string, CircuitBreakerPolicy>>;
  private readonly chain: { id: string; transport: T; policy: ResiliencePolicy }[];

  constructor(
    entries: ResilientTransportEntry<T>[],
    private readonly options: ResilientTransportOptions = {},
  ) {
    if (entries.length === 0) {
      throw new Error('resilientTransport() needs at least one transport.');
    }
    const prefix = options.keyPrefix ? `${options.keyPrefix}:` : '';
    const breakers: Record<string, CircuitBreakerPolicy> = {};
    // Built once per entry: the breaker's state lives in this instance, across sends.
    this.chain = entries.map((entry) => {
      const name = `${prefix}${entry.id}`;
      const breaker = new CircuitBreakerPolicy({ ...options.breaker, name });
      breakers[entry.id] = breaker;
      const timeout = new TimeoutPolicy({ timeout: options.timeout ?? DEFAULT_TIMEOUT, name });
      return { ...entry, policy: ResiliencePolicy.wrap(breaker, timeout) };
    });
    this.breakers = breakers;
  }

  /** Try each provider in order; the first that succeeds wins, else the last error is thrown. */
  send: T['send'] = (async (...args: unknown[]) => {
    let lastError: unknown;
    for (const [index, entry] of this.chain.entries()) {
      try {
        return await entry.policy.execute(({ signal }) =>
          entry.transport.send(...withSignal(args, signal)),
        );
      } catch (error) {
        lastError = error;
        if (!this.failsOver(error) || index === this.chain.length - 1) break;
        this.options.onFailover?.(entry.id, error, index);
      }
    }
    throw lastError;
  }) as T['send'];

  /** Closes every wrapped transport that can be closed. */
  async close(): Promise<void> {
    await Promise.all(this.chain.map(({ transport }) => transport.close?.()));
  }

  private failsOver(error: unknown): boolean {
    if (error instanceof CircuitOpenError || error instanceof ResilienceTimeoutError) return true;
    return this.options.failoverIf ? this.options.failoverIf(error) : true;
  }
}

/**
 * Wrap an ordered list of provider transports into one resilient transport.
 *
 * Each provider gets a `@nestjs/resilience` `CircuitBreakerPolicy` (outer) around a `TimeoutPolicy`
 * (inner). A send tries the providers in order: an open breaker rejects instantly
 * (`CircuitOpenError`), so a known-dead provider is skipped without a wasted call, and a provider
 * slower than `timeout` fails the attempt (`ResilienceTimeoutError`) and counts toward its breaker.
 * The first provider that succeeds stops the chain; if all fail, the last error is thrown. Breaker
 * state is in-process. State changes are published on the `nestjs:resilience:*` diagnostics
 * channels (https://docs.nestjs.com/reliability/resilience).
 *
 * When the call's last argument is an options object with a `signal` (a `@nestjs/mail`
 * transport's `send(message, { signal })`), the attempt's timeout signal is combined into it, so the
 * transport stops on a timeout.
 */
export function resilientTransport<T extends SendingTransport>(
  entries: ResilientTransportEntry<T>[],
  options: ResilientTransportOptions = {},
): ResilientTransport<T> {
  return new ResilientTransport(entries, options);
}

function withSignal(args: unknown[], signal: AbortSignal): unknown[] {
  const last = args[args.length - 1];
  if (
    last &&
    typeof last === 'object' &&
    (last as { signal?: unknown }).signal instanceof AbortSignal
  ) {
    const caller = (last as { signal: AbortSignal }).signal;
    return [...args.slice(0, -1), { ...last, signal: AbortSignal.any([caller, signal]) }];
  }
  return args;
}
