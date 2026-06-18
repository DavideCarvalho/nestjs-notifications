import { describe, expect, it, vi } from 'vitest';
import { failover } from './failover';

describe('failover', () => {
  it('returns the first provider that succeeds', async () => {
    const a = vi.fn().mockResolvedValue('A');
    const b = vi.fn().mockResolvedValue('B');
    const result = await failover([a, b], (p) => p());
    expect(result).toBe('A');
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it('falls through to the next provider on failure', async () => {
    const a = vi.fn().mockRejectedValue(new Error('down'));
    const b = vi.fn().mockResolvedValue('B');
    const onFailover = vi.fn();
    const result = await failover([a, b], (p) => p(), onFailover);
    expect(result).toBe('B');
    expect(onFailover).toHaveBeenCalledTimes(1);
    expect(onFailover.mock.calls[0]?.[2]).toBe(0);
  });

  it('rethrows the last error when every provider fails', async () => {
    const a = vi.fn().mockRejectedValue(new Error('a'));
    const b = vi.fn().mockRejectedValue(new Error('b-last'));
    await expect(failover([a, b], (p) => p())).rejects.toThrow('b-last');
  });

  it('throws synchronously when there are no providers', async () => {
    await expect(failover([], async () => undefined)).rejects.toThrow(/at least one/);
  });
});
