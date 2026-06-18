import { describe, expect, it, vi } from 'vitest';
import { FailoverSmsTransport, type SmsTransport, type SmsTransportPayload } from './transport';

const payload: SmsTransportPayload = { to: '+15555550100', text: 'hi' };

describe('FailoverSmsTransport', () => {
  it('uses the first transport when it succeeds', async () => {
    const a: SmsTransport = { send: vi.fn().mockResolvedValue(undefined) };
    const b: SmsTransport = { send: vi.fn().mockResolvedValue(undefined) };

    await new FailoverSmsTransport([a, b]).send(payload);

    expect(a.send).toHaveBeenCalledWith(payload);
    expect(b.send).not.toHaveBeenCalled();
  });

  it('falls back to the next transport and notifies onFailover', async () => {
    const a: SmsTransport = { send: vi.fn().mockRejectedValue(new Error('twilio down')) };
    const b: SmsTransport = { send: vi.fn().mockResolvedValue(undefined) };
    const onFailover = vi.fn();

    await new FailoverSmsTransport([a, b], onFailover).send(payload);

    expect(b.send).toHaveBeenCalledWith(payload);
    expect(onFailover).toHaveBeenCalledTimes(1);
    expect(onFailover.mock.calls[0]?.[0]).toBe(a);
  });

  it('rethrows the last error when all transports fail', async () => {
    const a: SmsTransport = { send: vi.fn().mockRejectedValue(new Error('a')) };
    const b: SmsTransport = { send: vi.fn().mockRejectedValue(new Error('b-last')) };

    await expect(new FailoverSmsTransport([a, b]).send(payload)).rejects.toThrow('b-last');
  });

  it('throws when constructed with no transports', () => {
    expect(() => new FailoverSmsTransport([])).toThrow(/at least one/);
  });
});
