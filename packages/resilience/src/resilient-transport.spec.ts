import { FakeClock, InMemoryResilienceStore } from '@dudousxd/nestjs-resilience';
import { describe, expect, it, vi } from 'vitest';
import { resilientTransport } from './resilient-transport';

interface Payload {
  text: string;
}
const payload: Payload = { text: 'hi' };

const ok = () => ({ send: vi.fn<(p: Payload) => Promise<void>>().mockResolvedValue(undefined) });
const failing = () => ({
  send: vi.fn<(p: Payload) => Promise<void>>().mockRejectedValue(new Error('down')),
});

describe('resilientTransport', () => {
  it('uses the first transport when it succeeds', async () => {
    const a = ok();
    const b = ok();
    await resilientTransport([
      { id: 'a', transport: a },
      { id: 'b', transport: b },
    ]).send(payload);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).not.toHaveBeenCalled();
  });

  it('fails over to the next transport and reports onFailover with the provider id', async () => {
    const a = failing();
    const b = ok();
    const onFailover = vi.fn();
    await resilientTransport(
      [
        { id: 'twilio', transport: a },
        { id: 'vonage', transport: b },
      ],
      { onFailover },
    ).send(payload);
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(onFailover).toHaveBeenCalledWith('twilio', expect.any(Error), 0);
  });

  it('throws the last error when every transport fails', async () => {
    const a = failing();
    const b = failing();
    await expect(
      resilientTransport([
        { id: 'a', transport: a },
        { id: 'b', transport: b },
      ]).send(payload),
    ).rejects.toThrow('down');
  });

  it('opens a per-provider circuit so a dead provider is skipped, then probes after cooldown', async () => {
    const clock = new FakeClock();
    const store = new InMemoryResilienceStore(clock);
    const a = failing();
    const b = ok();
    const t = resilientTransport(
      [
        { id: 'a', transport: a },
        { id: 'b', transport: b },
      ],
      { store, breaker: { threshold: 2, cooldownMs: 1000 }, keyPrefix: 'sms' },
    );

    await t.send(payload); // a fails (1), falls over to b
    await t.send(payload); // a fails (2) -> a's circuit opens, b delivers
    expect(a.send).toHaveBeenCalledTimes(2);

    await t.send(payload); // a is open -> short-circuited, skipped; b delivers
    await t.send(payload); // still open -> skipped; b delivers
    expect(a.send).toHaveBeenCalledTimes(2); // not called while the circuit is open
    expect(b.send).toHaveBeenCalledTimes(4);

    clock.advance(1000); // cooldown elapses -> half-open
    await t.send(payload); // a is probed again (3), fails -> re-opens; b delivers
    expect(a.send).toHaveBeenCalledTimes(3);
  });

  it('times out a slow provider and fails over to a fast one', async () => {
    const slow = {
      send: vi.fn<(p: Payload) => Promise<void>>(
        () => new Promise<void>((resolve) => setTimeout(resolve, 200)),
      ),
    };
    const fast = ok();
    await expect(
      resilientTransport(
        [
          { id: 'slow', transport: slow },
          { id: 'fast', transport: fast },
        ],
        { timeoutMs: 30 },
      ).send(payload),
    ).resolves.toBeUndefined();
    expect(fast.send).toHaveBeenCalledTimes(1);
  });

  it('throws when given no transports', () => {
    expect(() => resilientTransport([])).toThrow(/at least one/i);
  });
});
