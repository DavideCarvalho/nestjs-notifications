import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { PushMessage } from './push-message';
import { PushChannel } from './push.channel';
import type { PushNotification } from './push.channel';
import type { PushTransport } from './transport';

class TestUser implements Notifiable {
  constructor(public token: unknown) {}
  routeNotificationFor(): unknown {
    return this.token;
  }
}

class OrderShippedNotification implements PushNotification {
  via(): string[] {
    return ['push'];
  }
  toPush(): PushMessage {
    return new PushMessage()
      .title('Order shipped')
      .body('Your order is on its way.')
      .icon('https://app.example.com/icon.png')
      .url('https://app.example.com/orders/42')
      .data({ orderId: 42 });
  }
}

describe('PushMessage', () => {
  it('serializes only the fields that were set via toObject()', () => {
    const message = new PushMessage().title('Hi').body('There').data({ a: 1 });

    expect(message.toObject()).toEqual({ title: 'Hi', body: 'There', data: { a: 1 } });
    expect(message.titleText).toBe('Hi');
    expect(message.bodyText).toBe('There');
    expect(message.dataPayload).toEqual({ a: 1 });
    expect(message.iconUrl).toBeUndefined();
    expect(message.linkUrl).toBeUndefined();
  });

  it('includes icon and url when set', () => {
    const message = new PushMessage().title('T').icon('https://x/icon.png').url('https://x/go');

    expect(message.toObject()).toEqual({
      title: 'T',
      icon: 'https://x/icon.png',
      url: 'https://x/go',
    });
  });
});

describe('PushChannel', () => {
  it('sends once to a single target with the built message', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: PushTransport = { send };

    const channel = new PushChannel(transport);
    await channel.send(new TestUser('device-token-1'), new OrderShippedNotification());

    expect(send).toHaveBeenCalledOnce();
    const [target, message] = send.mock.calls[0] ?? [];
    expect(target).toBe('device-token-1');
    expect(message).toBeInstanceOf(PushMessage);
    expect((message as PushMessage).titleText).toBe('Order shipped');
    expect((message as PushMessage).bodyText).toBe('Your order is on its way.');
  });

  it('sends to each target when the route is an array', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: PushTransport = { send };

    const channel = new PushChannel(transport);
    await channel.send(new TestUser(['t1', 't2', 't3']), new OrderShippedNotification());

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map((c) => c[0])).toEqual(['t1', 't2', 't3']);
    for (const call of send.mock.calls) {
      expect((call[1] as PushMessage).titleText).toBe('Order shipped');
    }
  });

  it('throws MissingChannelMethodError when toPush is absent', async () => {
    const transport: PushTransport = { send: vi.fn() };
    const channel = new PushChannel(transport);

    const bare: Notification = { via: () => ['push'] };

    await expect(channel.send(new TestUser('t'), bare)).rejects.toThrow(/toPush\(\)/);
  });
});
