import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { MailMessage } from './mail-message';
import { MailChannel } from './mail.channel';
import type { MailNotification } from './mail.channel';
import { DefaultMailRenderer, MarkdownMailRenderer } from './renderer';
import { composeRawEmail } from './ses.transport';
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
    expect(payload.attachments).toBeUndefined();
  });

  it('carries attachments through to the transport', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const channel = new MailChannel({ send }, new DefaultMailRenderer(), {});

    class ReportNotification implements MailNotification {
      via(): string[] {
        return ['mail'];
      }
      toMail(): MailMessage {
        return new MailMessage()
          .subject('Report')
          .line('See attached.')
          .attach({ filename: 'report.pdf', content: 'PDF', contentType: 'application/pdf' });
      }
    }

    await channel.send(new TestUser('user@example.com'), new ReportNotification());

    const payload = send.mock.calls[0]?.[0];
    expect(payload.attachments).toEqual([
      { filename: 'report.pdf', content: 'PDF', contentType: 'application/pdf' },
    ]);
  });

  it('throws MissingChannelMethodError when toMail is absent', async () => {
    const transport: MailTransport = { send: vi.fn() };
    const channel = new MailChannel(transport, new DefaultMailRenderer(), {});

    const bare: Notification = { via: () => ['mail'] };

    await expect(channel.send(new TestUser('x@y.com'), bare)).rejects.toThrow(/toMail\(\)/);
  });

  it('uses the resolved per-tenant transport when context.tenant is set', async () => {
    const defaultSend = vi.fn().mockResolvedValue(undefined);
    const tenantSend = vi.fn().mockResolvedValue(undefined);
    const defaultTransport: MailTransport = { send: defaultSend };
    const tenantTransport: MailTransport = { send: tenantSend };

    const resolveTransport = vi.fn().mockReturnValue(tenantTransport);

    const channel = new MailChannel(
      defaultTransport,
      new DefaultMailRenderer(),
      { from: 'no-reply@example.com' },
      resolveTransport,
    );

    await channel.send(new TestUser('user@example.com'), new WelcomeNotification(), {
      tenant: 'acme',
    });

    expect(resolveTransport).toHaveBeenCalledWith('acme');
    expect(tenantSend).toHaveBeenCalledOnce();
    expect(defaultSend).not.toHaveBeenCalled();
  });

  it('uses the default transport when no tenant is in the context', async () => {
    const defaultSend = vi.fn().mockResolvedValue(undefined);
    const tenantSend = vi.fn().mockResolvedValue(undefined);
    const defaultTransport: MailTransport = { send: defaultSend };
    const resolveTransport = vi.fn().mockReturnValue({ send: tenantSend });

    const channel = new MailChannel(
      defaultTransport,
      new DefaultMailRenderer(),
      {},
      resolveTransport,
    );

    await channel.send(new TestUser('user@example.com'), new WelcomeNotification());

    expect(resolveTransport).not.toHaveBeenCalled();
    expect(defaultSend).toHaveBeenCalledOnce();
    expect(tenantSend).not.toHaveBeenCalled();
  });
});

describe('SesTransport', () => {
  it('composeRawEmail builds a MIME message carrying attachments', async () => {
    const raw = await composeRawEmail({
      to: 'a@example.com',
      from: 'x@example.com',
      subject: 'Report',
      html: '<p>see attached</p>',
      text: 'see attached',
      attachments: [{ filename: 'report.pdf', content: 'PDFDATA', contentType: 'application/pdf' }],
    });
    const mime = raw.toString('utf8');
    expect(mime).toContain('Subject: Report');
    expect(mime).toContain('report.pdf');
  });
});

describe('MarkdownMailRenderer', () => {
  it('renders a markdown body to html with the raw markdown as text fallback', () => {
    const message = new MailMessage().subject('Hi').markdown('# Hi\n\nWelcome **aboard**.');
    const { html, text } = new MarkdownMailRenderer().render(message);

    expect(html).toMatch(/<h1[^>]*>Hi<\/h1>/);
    expect(html).toContain('<strong>aboard</strong>');
    expect(text).toBe('# Hi\n\nWelcome **aboard**.');
  });

  it('falls back to default rendering when no markdown body is set', () => {
    const message = new WelcomeNotification().toMail();
    const { html } = new MarkdownMailRenderer().render(message);

    expect(html).toContain('Hello!');
    expect(html).toContain('Get started');
  });
});
