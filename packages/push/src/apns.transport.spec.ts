import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApnsTransport } from './apns.transport';
import { PushMessage } from './push-message';

const send = vi.fn();
const ProviderCtor = vi.fn();

vi.mock('@parse/node-apn', () => {
  class FakeNotification {
    alert?: unknown;
    payload?: unknown;
    topic?: unknown;
    sound?: unknown;
  }
  return {
    default: {
      Provider: class {
        constructor(opts: unknown) {
          ProviderCtor(opts);
        }
        send = send;
      },
      Notification: FakeNotification,
    },
  };
});

describe('ApnsTransport', () => {
  beforeEach(() => {
    send.mockReset();
    ProviderCtor.mockReset();
    send.mockResolvedValue({ sent: [{ device: 'd' }], failed: [] });
  });

  it('constructs the provider with the injected token options', () => {
    new ApnsTransport({
      token: { key: 'k.p8', keyId: 'KID', teamId: 'TID' },
      production: true,
      topic: 'com.example.app',
    });

    expect(ProviderCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        token: { key: 'k.p8', keyId: 'KID', teamId: 'TID' },
        production: true,
      }),
    );
  });

  it('maps the PushMessage to an apn.Notification and sends to the device token', async () => {
    const transport = new ApnsTransport({
      token: { key: 'k.p8', keyId: 'KID', teamId: 'TID' },
      topic: 'com.example.app',
    });

    const message = new PushMessage()
      .title('Order shipped')
      .body('On its way')
      .url('https://app/orders/42')
      .data({ orderId: 42 });

    await transport.send('device-token-1', message);

    expect(send).toHaveBeenCalledOnce();
    const [notification, deviceToken] = send.mock.calls[0] ?? [];
    expect(deviceToken).toBe('device-token-1');
    expect(notification.alert).toEqual({ title: 'Order shipped', body: 'On its way' });
    expect(notification.payload).toEqual({ orderId: 42, url: 'https://app/orders/42' });
    expect(notification.topic).toBe('com.example.app');
    expect(notification.sound).toBe('default');
  });

  it('honors a per-target topic over the default option topic', async () => {
    const transport = new ApnsTransport({
      token: { key: 'k.p8', keyId: 'KID', teamId: 'TID' },
      topic: 'com.example.app',
    });

    await transport.send(
      { deviceToken: 'tok', topic: 'com.example.other' },
      new PushMessage().title('Hi'),
    );

    const [notification, deviceToken] = send.mock.calls[0] ?? [];
    expect(deviceToken).toBe('tok');
    expect(notification.topic).toBe('com.example.other');
  });

  it('throws when the APNs result reports failures', async () => {
    send.mockResolvedValue({
      sent: [],
      failed: [{ device: 'd', response: { reason: 'BadDeviceToken' } }],
    });
    const transport = new ApnsTransport({ token: { key: 'k.p8', keyId: 'KID', teamId: 'TID' } });

    await expect(transport.send('tok', new PushMessage().title('Hi'))).rejects.toThrow(
      /BadDeviceToken/,
    );
  });
});
