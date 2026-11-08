import { CircuitOpenError, ResilienceTimeoutError } from '@nestjs/resilience';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resilientTransport } from './resilient-transport';

interface Payload {
  text: string;
}
const payload: Payload = { text: 'hi' };

const ok = () => ({ send: vi.fn<(p: Payload) => Promise<string>>().mockResolvedValue('sent') });
const failing = (error: unknown = new Error('down')) => ({
  send: vi.fn<(p: Payload) => Promise<string>>().mockRejectedValue(error),
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resilientTransport', () => {
  it('uses the first transport when it succeeds, and returns its result', async () => {
    const a = ok();
    const b = ok();
    const t = resilientTransport([
      { id: 'a', transport: a },
      { id: 'b', transport: b },
    ]);
    await expect(t.send(payload)).resolves.toBe('sent');
    expect(a.send).toHaveBeenCalledWith(payload);
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
    await expect(
      resilientTransport([
        { id: 'a', transport: failing(new Error('a down')) },
        { id: 'b', transport: failing(new Error('b down')) },
      ]).send(payload),
    ).rejects.toThrow('b down');
  });

  it('stops at an error failoverIf rejects', async () => {
    const invalid = Object.assign(new Error('invalid number'), { status: 400 });
    const b = ok();
    await expect(
      resilientTransport(
        [
          { id: 'a', transport: failing(invalid) },
          { id: 'b', transport: b },
        ],
        { failoverIf: (error) => (error as { status?: number }).status !== 400 },
      ).send(payload),
    ).rejects.toBe(invalid);
    expect(b.send).not.toHaveBeenCalled();
  });

  it('opens a per-provider circuit so a dead provider is skipped, then probes after openDuration', async () => {
    vi.useFakeTimers();
    const a = failing();
    const b = ok();
    const onFailover = vi.fn();
    const t = resilientTransport(
      [
        { id: 'a', transport: a },
        { id: 'b', transport: b },
      ],
      {
        keyPrefix: 'sms',
        breaker: { minimumCalls: 2, slidingWindow: { type: 'count', size: 2 }, openDuration: 1000 },
        onFailover,
      },
    );

    await t.send(payload); // a fails (1), b delivers
    await t.send(payload); // a fails (2) -> 100% of 2 calls -> a opens
    expect(a.send).toHaveBeenCalledTimes(2);
    expect(t.breakers.a?.state).toBe('open');
    expect(t.breakers.a?.name).toBe('sms:a');

    await t.send(payload); // a open -> rejected without a call, b delivers
    expect(a.send).toHaveBeenCalledTimes(2);
    expect(onFailover).toHaveBeenLastCalledWith('a', expect.any(CircuitOpenError), 0);
    expect(b.send).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(1000); // openDuration passes -> half-open
    await t.send(payload); // a probed (3), fails -> open again; b delivers
    expect(a.send).toHaveBeenCalledTimes(3);
    expect(t.breakers.a?.state).toBe('open');
  });

  it('times out a slow provider (ResilienceTimeoutError) and fails over to a fast one', async () => {
    vi.useFakeTimers();
    const slow = {
      send: vi.fn<(p: Payload) => Promise<string>>(
        () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 5_000)),
      ),
    };
    const fast = ok();
    const onFailover = vi.fn();
    const sending = resilientTransport(
      [
        { id: 'slow', transport: slow },
        { id: 'fast', transport: fast },
      ],
      { timeout: 30, onFailover },
    ).send(payload);
    await vi.advanceTimersByTimeAsync(30);
    await expect(sending).resolves.toBe('sent');
    expect(onFailover).toHaveBeenCalledWith('slow', expect.any(ResilienceTimeoutError), 0);
  });

  it("combines the attempt's timeout signal into a send options object", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const transport = {
      send: vi.fn((_message: string, options: { signal: AbortSignal }) => {
        seen = options.signal;
        return new Promise<never>(() => {});
      }),
    };
    const caller = new AbortController();
    const sending = resilientTransport([{ id: 'only', transport }], { timeout: 50 }).send('m', {
      signal: caller.signal,
    });
    const assertion = expect(sending).rejects.toBeInstanceOf(ResilienceTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(seen?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  it('closes every wrapped transport', async () => {
    const close = vi.fn();
    const withClose: { send: (p: Payload) => Promise<string>; close?: () => void } = {
      ...ok(),
      close,
    };
    await resilientTransport([
      { id: 'a', transport: withClose },
      { id: 'b', transport: ok() },
    ]).close();
    expect(close).toHaveBeenCalledOnce();
  });

  it('throws when given no transports', () => {
    expect(() => resilientTransport([])).toThrow(/at least one/i);
  });
});
