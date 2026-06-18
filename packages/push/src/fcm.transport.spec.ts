import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushMessage } from './push-message';

const send = vi.fn();
const sendEachForMulticast = vi.fn();

vi.mock('firebase-admin', () => ({
  apps: [{}], // pretend an app is already initialized so the ctor doesn't call initializeApp
  initializeApp: vi.fn(),
  messaging: () => ({ send, sendEachForMulticast }),
}));

import { FcmTransport } from './fcm.transport';

describe('FcmTransport.sendMany', () => {
  beforeEach(() => {
    send.mockReset();
    sendEachForMulticast.mockReset();
  });

  it('multicasts to all tokens and returns unregistered ones as invalid', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: true },
      ],
    });

    const transport = new FcmTransport({});
    const message = new PushMessage().title('Hi').body('There');
    const result = await transport.sendMany(['t1', 't2', 't3'], message);

    expect(sendEachForMulticast).toHaveBeenCalledOnce();
    expect(sendEachForMulticast.mock.calls[0]?.[0].tokens).toEqual(['t1', 't2', 't3']);
    expect(result.invalidTargets).toEqual(['t2']);
  });

  it('does not treat transient errors as dead tokens', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
    });

    const transport = new FcmTransport({});
    const result = await transport.sendMany(['t1'], new PushMessage().title('x'));

    expect(result.invalidTargets).toEqual([]);
  });

  it('chunks requests at the 500-token limit', async () => {
    sendEachForMulticast.mockResolvedValue({ responses: [] });
    const transport = new FcmTransport({});
    const tokens = Array.from({ length: 750 }, (_, i) => `t${i}`);

    await transport.sendMany(tokens, new PushMessage().title('x'));

    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(sendEachForMulticast.mock.calls[0]?.[0].tokens).toHaveLength(500);
    expect(sendEachForMulticast.mock.calls[1]?.[0].tokens).toHaveLength(250);
  });
});
