import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { MailMessage } from './mail-message';
import { MailChannel } from './mail.channel';
import type { MailNotification } from './mail.channel';
import { DefaultMailRenderer } from './renderer';
import type { MailTransport } from './transport';

class TestUser implements Notifiable {
  constructor(public email: string) {}
  routeNotificationFor(): unknown {
    return this.email;
  }
}

class WelcomeNotification implements MailNotification {
  via(): string[] {
    return ['mail'];
  }
  toMail(): MailMessage {
    return new MailMessage()
      .subject('Welcome aboard')
      .greeting('Hello!')
      .line('Thanks for joining us.')
      .line('We are glad to have you.')
      .action('Get started', 'https://app.example.com/start')
      .salutation('Cheers');
  }
}

describe('DefaultMailRenderer', () => {
  it('renders subject lines, body and action into html', () => {
    const message = new WelcomeNotification().toMail();
    const { html, text } = new DefaultMailRenderer().render(message);

    expect(html).toContain('Hello!');
    expect(html).toContain('Thanks for joining us.');
    expect(html).toContain('We are glad to have you.');
    expect(html).toContain('https://app.example.com/start');
    expect(html).toContain('Get started');

    expect(text).toContain('Thanks for joining us.');
    expect(text).toContain('https://app.example.com/start');
  });
});

describe('MailChannel', () => {
  it('renders and sends through the transport with the routed recipient', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const transport: MailTransport = { send };

    const channel = new MailChannel(transport, new DefaultMailRenderer(), {
      from: 'no-reply@example.com',
    });

    await channel.send(new TestUser('user@example.com'), new WelcomeNotification());

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]?.[0];
    expect(payload.to).toBe('user@example.com');
    expect(payload.subject).toBe('Welcome aboard');
    expect(payload.from).toBe('no-reply@example.com');
    expect(payload.html).toContain('Get started');
  });

  it('throws MissingChannelMethodError when toMail is absent', async () => {
    const transport: MailTransport = { send: vi.fn() };
    const channel = new MailChannel(transport, new DefaultMailRenderer(), {});

    const bare: Notification = { via: () => ['mail'] };

    await expect(channel.send(new TestUser('x@y.com'), bare)).rejects.toThrow(/toMail\(\)/);
  });
});
