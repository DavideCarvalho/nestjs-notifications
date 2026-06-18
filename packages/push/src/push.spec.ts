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

  it('uses the per-tenant transport when a tenant is in the delivery context', async () => {
    const defaultSend = vi.fn().mockResolvedValue(undefined);
    const defaultTransport: PushTransport = { send: defaultSend };
    const tenantSend = vi.fn().mockResolvedValue(undefined);
    const tenantTransport: PushTransport = { send: tenantSend };
    const resolveTransport = vi.fn().mockReturnValue(tenantTransport);

    const channel = new PushChannel(defaultTransport, resolveTransport);
    await channel.send(new TestUser('device-token-1'), new OrderShippedNotification(), {
      tenant: 'acme',
    });

    expect(resolveTransport).toHaveBeenCalledWith('acme');
    expect(tenantSend).toHaveBeenCalledOnce();
    expect(defaultSend).not.toHaveBeenCalled();
  });

  it('uses the default transport when no tenant is provided', async () => {
    const defaultSend = vi.fn().mockResolvedValue(undefined);
    const defaultTransport: PushTransport = { send: defaultSend };
    const tenantSend = vi.fn().mockResolvedValue(undefined);
    const resolveTransport = vi.fn().mockReturnValue({ send: tenantSend });

    const channel = new PushChannel(defaultTransport, resolveTransport);
    await channel.send(new TestUser('device-token-1'), new OrderShippedNotification());

    expect(resolveTransport).not.toHaveBeenCalled();
    expect(defaultSend).toHaveBeenCalledOnce();
    expect(tenantSend).not.toHaveBeenCalled();
  });

  it('throws MissingChannelMethodError when toPush is absent', async () => {
    const transport: PushTransport = { send: vi.fn() };
    const channel = new PushChannel(transport);

    const bare: Notification = { via: () => ['push'] };

    await expect(channel.send(new TestUser('t'), bare)).rejects.toThrow(/toPush\(\)/);
  });

  it('prefers a single multicast (sendMany) over per-target send for arrays', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sendMany = vi.fn().mockResolvedValue({ invalidTargets: [] });
    const transport: PushTransport = { send, sendMany };

    const channel = new PushChannel(transport);
    await channel.send(new TestUser(['t1', 't2', 't3']), new OrderShippedNotification());

    expect(sendMany).toHaveBeenCalledOnce();
    expect(sendMany.mock.calls[0]?.[0]).toEqual(['t1', 't2', 't3']);
    expect(send).not.toHaveBeenCalled();
  });

  it('invokes the invalid-token callback with the tokens the provider rejected', async () => {
    const sendMany = vi.fn().mockResolvedValue({ invalidTargets: ['t2'] });
    const transport: PushTransport = { send: vi.fn(), sendMany };
    const onInvalidTokens = vi.fn();

    const channel = new PushChannel(transport, undefined, onInvalidTokens);
    await channel.send(new TestUser(['t1', 't2']), new OrderShippedNotification(), {
      tenant: 'acme',
    });

    expect(onInvalidTokens).toHaveBeenCalledOnce();
    expect(onInvalidTokens.mock.calls[0]?.[0]).toMatchObject({
      invalidTargets: ['t2'],
      tenant: 'acme',
    });
  });

  it('does not call the callback when there are no invalid tokens', async () => {
    const sendMany = vi.fn().mockResolvedValue({ invalidTargets: [] });
    const transport: PushTransport = { send: vi.fn(), sendMany };
    const onInvalidTokens = vi.fn();

    const channel = new PushChannel(transport, undefined, onInvalidTokens);
    await channel.send(new TestUser(['t1']), new OrderShippedNotification());

    expect(onInvalidTokens).not.toHaveBeenCalled();
  });

  it('swallows errors thrown by the invalid-token callback', async () => {
    const sendMany = vi.fn().mockResolvedValue({ invalidTargets: ['t1'] });
    const transport: PushTransport = { send: vi.fn(), sendMany };
    const onInvalidTokens = vi.fn().mockRejectedValue(new Error('store down'));

    const channel = new PushChannel(transport, undefined, onInvalidTokens);
    await expect(
      channel.send(new TestUser(['t1']), new OrderShippedNotification()),
    ).resolves.toBeUndefined();
  });

  it('falls back to per-target send when the transport has no sendMany', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: PushTransport = { send };

    const channel = new PushChannel(transport);
    await channel.send(new TestUser(['t1', 't2']), new OrderShippedNotification());

    expect(send).toHaveBeenCalledTimes(2);
  });
});
