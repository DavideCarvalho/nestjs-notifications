/**
 * Map `items` through `fn` with at most `limit` calls in flight, resolving to the results in input
 * order. Rejects with the first error as soon as it happens, like `Promise.all`; the remaining
 * items still run, so one failure doesn't change which of the others get attempted.
 */
export function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return new Promise<R[]>((resolve, reject) => {
    const results = new Array<R>(items.length);
    if (items.length === 0) {
      resolve(results);
      return;
    }
    let next = 0;
    let settled = 0;
    let failed = false;
    const launch = (): void => {
      const index = next++;
      let pending: Promise<R>;
      try {
        pending = fn(items[index] as T, index);
      } catch (error) {
        pending = Promise.reject(error);
      }
      pending.then(
        (value) => {
          results[index] = value;
          finish();
        },
        (error: unknown) => {
          if (!failed) {
            failed = true;
            reject(error);
          }
          finish();
        },
      );
    };
    const finish = (): void => {
      settled++;
      if (next < items.length) launch();
      else if (settled === items.length && !failed) resolve(results);
    };
    for (let i = 0; i < Math.min(limit, items.length); i++) launch();
  });
}
