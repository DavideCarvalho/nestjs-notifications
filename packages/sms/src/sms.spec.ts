import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { SmsMessage } from './sms-message';
import { SmsChannel } from './sms.channel';
import type { SmsNotification } from './sms.channel';
import type { SmsTransport } from './transport';

class TestUser implements Notifiable {
  constructor(public phone: string) {}
  routeNotificationFor(): unknown {
    return this.phone;
  }
}

class StringNotification implements SmsNotification {
  via(): string[] {
    return ['sms'];
  }
  toSms(): string {
    return 'Your code is 123456';
  }
}

class MessageNotification implements SmsNotification {
  via(): string[] {
    return ['sms'];
  }
  toSms(): SmsMessage {
    return new SmsMessage().content('Hello from a builder').from('+15555550199');
  }
}

describe('SmsChannel', () => {
  it('sends a string payload through the transport with the routed recipient', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: SmsTransport = { send };

    const channel = new SmsChannel(transport, { from: '+15555550100' });

    await channel.send(new TestUser('+15555551234'), new StringNotification());

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0];
    expect(payload.to).toBe('+15555551234');
    expect(payload.from).toBe('+15555550100');
    expect(payload.text).toBe('Your code is 123456');
  });

  it('sends an SmsMessage payload, honoring its from override', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: SmsTransport = { send };

    const channel = new SmsChannel(transport, { from: '+15555550100' });

    await channel.send(new TestUser('+15555551234'), new MessageNotification());

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0];
    expect(payload.to).toBe('+15555551234');
    expect(payload.from).toBe('+15555550199');
    expect(payload.text).toBe('Hello from a builder');
  });

  it('throws MissingChannelMethodError when toSms is absent', async () => {
    const transport: SmsTransport = { send: vi.fn() };
    const channel = new SmsChannel(transport, {});

    const bare: Notification = { via: () => ['sms'] };

    await expect(channel.send(new TestUser('+15555551234'), bare)).rejects.toThrow(/toSms\(\)/);
  });
});
