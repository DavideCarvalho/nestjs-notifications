/**
 * Called when a provider in a failover chain throws, just before the next one is tried. Use it
 * to log/alert which provider failed. `index` is the provider's position in the chain.
 */
export type FailoverListener<T> = (failed: T, error: unknown, index: number) => void;

/**
 * Try an ordered list of providers in turn until one succeeds, returning that provider's result.
 * The classic resilience primitive behind `FailoverMailTransport` — extracted so SMS, webhook,
 * Slack, or any provider-shaped transport can reuse it instead of re-implementing the loop.
 *
 * The last error is rethrown if every provider fails. Throws synchronously if `providers` is
 * empty (a misconfiguration).
 *
 * ```ts
 * await failover(transports, (t, payload) => t.send(payload), payload, onFailover);
 * ```
 *
 * @param providers Ordered candidates; earlier entries are preferred.
 * @param attempt   Runs one provider; resolve = success, reject = try the next.
 * @param onFailover Optional per-failure hook (provider, error, index).
 */
export async function failover<T, R>(
  providers: readonly T[],
  attempt: (provider: T) => Promise<R>,
  onFailover?: FailoverListener<T>,
): Promise<R> {
  if (providers.length === 0) {
    throw new Error('failover() needs at least one provider.');
  }
  let lastError: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i] as T;
    try {
      return await attempt(provider);
    } catch (error) {
      lastError = error;
      onFailover?.(provider, error, i);
    }
  }
  throw lastError;
}
