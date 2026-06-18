import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushMessage } from './push-message';

const { sendPushNotificationsAsync, chunkPushNotifications, isExpoPushToken } = vi.hoisted(() => ({
  sendPushNotificationsAsync: vi.fn(),
  chunkPushNotifications: vi.fn(),
  isExpoPushToken: vi.fn(),
}));

vi.mock('expo-server-sdk', () => {
  class FakeExpo {
    sendPushNotificationsAsync = sendPushNotificationsAsync;
    chunkPushNotifications = chunkPushNotifications;
    static isExpoPushToken = isExpoPushToken;
  }
  return { Expo: FakeExpo };
});

import { ExpoTransport } from './expo.transport';

describe('ExpoTransport.sendMany', () => {
  beforeEach(() => {
    sendPushNotificationsAsync.mockReset();
    chunkPushNotifications.mockReset();
    isExpoPushToken.mockReset();
    isExpoPushToken.mockReturnValue(true);
    // identity chunking by default
    chunkPushNotifications.mockImplementation((m: unknown[]) => [m]);
  });

  it('reports DeviceNotRegistered tickets as invalid tokens', async () => {
    sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);

    const transport = new ExpoTransport({});
    const result = await transport.sendMany(
      ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
      new PushMessage().title('Hi'),
    );

    expect(result.invalidTargets).toEqual(['ExponentPushToken[b]']);
  });

  it('treats malformed (non-Expo) tokens as invalid without sending them', async () => {
    isExpoPushToken.mockImplementation((t: string) => t.startsWith('ExponentPushToken'));
    sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);

    const transport = new ExpoTransport({});
    const result = await transport.sendMany(
      ['not-a-token', 'ExponentPushToken[a]'],
      new PushMessage().title('Hi'),
    );

    expect(result.invalidTargets).toEqual(['not-a-token']);
    // only the valid token was sent
    expect(sendPushNotificationsAsync.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('returns no invalid tokens when all tickets are ok', async () => {
    sendPushNotificationsAsync.mockResolvedValue([{ status: 'ok' }]);
    const transport = new ExpoTransport({});
    const result = await transport.sendMany(['ExponentPushToken[a]'], new PushMessage().title('x'));
    expect(result.invalidTargets).toEqual([]);
  });
});
