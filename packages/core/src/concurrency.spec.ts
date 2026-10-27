import { describe, expect, it } from 'vitest';
import { mapConcurrent } from './concurrency';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1));

describe('mapConcurrent', () => {
  it('keeps at most `limit` calls in flight and returns results in input order', async () => {
    let current = 0;
    let max = 0;
    const results = await mapConcurrent([5, 4, 3, 2, 1, 0, 9, 8], 3, async (n) => {
      current++;
      max = Math.max(max, current);
      for (let i = 0; i < n; i++) await tick();
      current--;
      return n * 10;
    });
    expect(max).toBe(3);
    expect(results).toEqual([50, 40, 30, 20, 10, 0, 90, 80]);
  });

  it('rejects with the first error while still attempting the remaining items', async () => {
    const attempted: number[] = [];
    const run = mapConcurrent([1, 2, 3, 4], 2, async (n) => {
      attempted.push(n);
      await tick();
      if (n === 1) throw new Error('first');
      if (n === 3) throw new Error('second');
      return n;
    });
    await expect(run).rejects.toThrow('first');
    for (let i = 0; i < 5; i++) await tick();
    expect(attempted.sort()).toEqual([1, 2, 3, 4]);
  });

  it('resolves an empty list immediately', async () => {
    expect(await mapConcurrent([], 5, async () => 1)).toEqual([]);
  });
});
