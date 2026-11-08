import {
  type ChannelContext,
  ChannelRunner,
  type Notifiable,
  type Notification,
  NotificationService,
  NotificationsModule,
  RouteFor,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import {
  InMemoryMailTransport,
  MailEvents,
  MailModule,
  type MailRenderContext,
  MailTransport,
  type MailTransportResult,
  type Mailable,
  type MailMessage as NestMailMessage,
  html,
} from '@nestjs/mail';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailMessage } from './mail-message';
import { currentMailScope } from './mail-scope';
import { Mail } from './mail.channel';
import { MailChannelModule } from './mail.module';
import { DefaultMailRenderer, MarkdownMailRenderer } from './renderer';
import { TenantRoutingMailTransport } from './tenant-routing.transport';

class User {
  @RouteFor('mail') email: string;
  locale = 'pt-BR';
  constructor(email: string) {
    this.email = email;
  }
}

class Welcome {
  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject('Welcome aboard')
      .greeting('Hello!')
      .line('Thanks for joining us.')
      .action('Get started', 'https://app.example.com/start')
      .header('X-Entity-Ref-ID', 'welcome-1')
      .attach({ filename: 'terms.txt', content: 'the terms' });
  }
}

@Injectable()
class OrderShippedMail implements Mailable<{ id: number }> {
  render(order: { id: number }, { locale }: MailRenderContext) {
    return {
      subject: `Order #${order.id} shipped (${locale})`,
      html: html`<p>Order ${order.id}</p>`,
    };
  }
}

class OrderShipped {
  constructor(readonly id: number) {}
  @Mail()
  toMail(_ctx: ChannelContext) {
    return { mail: OrderShippedMail, data: { id: this.id } };
  }
}

class Remote {
  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject('Report')
      .line('Attached.')
      .attach({ filename: 'report.pdf', url: 'https://files.example.com/report.pdf' });
  }
}

async function app(
  transport: MailTransport,
  channel: Parameters<typeof MailChannelModule.forRoot>[0] = {},
) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      NotificationsModule.forRoot({ emitter: true }),
      MailModule.forRoot({ transport, from: 'App <no-reply@example.com>', retry: false }),
      MailChannelModule.forRoot(channel),
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DefaultMailRenderer', () => {
  it('renders greeting, lines and action into html and text', () => {
    const { html: body, text } = new DefaultMailRenderer().render(new Welcome().toMail());
    expect(body).toContain('Hello!');
    expect(body).toContain('https://app.example.com/start');
    expect(text).toContain('Get started: https://app.example.com/start');
  });
});

describe('MarkdownMailRenderer', () => {
  it('renders a markdown body to html with the raw markdown as text fallback', () => {
    const { html: body, text } = new MarkdownMailRenderer().render(
      new MailMessage().subject('Hi').markdown('# Title\n\nSome **bold** text.'),
    );
    expect(body).toContain('<h1>Title</h1>');
    expect(text).toBe('# Title\n\nSome **bold** text.');
  });

  it('falls back to default rendering when no markdown body is set', () => {
    const { html: body } = new MarkdownMailRenderer().render(
      new MailMessage().subject('Hi').line('Plain'),
    );
    expect(body).toContain('<p>Plain</p>');
  });
});

describe('MailChannel over @nestjs/mail', () => {
  it('renders the MailMessage and sends it with the Mailer (module from, headers, attachments)', async () => {
    const mailbox = new InMemoryMailTransport();
    const moduleRef = await app(mailbox);
    const [result] = await moduleRef
      .get(NotificationService)
      .send(new User('ada@example.com'), new Welcome());

    const mail = mailbox.assertSent({ to: 'ada@example.com' });
    expect(mail.subject).toBe('Welcome aboard');
    expect(mail.from.address).toBe('no-reply@example.com');
    expect(mail.html).toContain('Thanks for joining us.');
    expect(mail.headers['X-Entity-Ref-ID']).toBe('welcome-1');
    expect(mail.attachment('terms.txt').content.toString()).toBe('the terms');
    expect(mail.locale).toBe('pt-BR');
    // The MailSendResult is the channel response (delivery tracking reads providerMessageId).
    expect(result?.results[0]).toMatchObject({ channel: 'mail', status: 'sent' });
    expect((result?.results[0]?.response as { messageId: string }).messageId).toBe(mail.messageId);
    await moduleRef.close();
  });

  it('sends a @nestjs/mail mail class with its data in the recipient locale', async () => {
    const mailbox = new InMemoryMailTransport();
    const moduleRef = await app(mailbox);
    await moduleRef
      .get(NotificationService)
      .send(new User('ada@example.com'), new OrderShipped(42));

    const mail = mailbox.assertSent({ mail: OrderShippedMail });
    expect(mail.subject).toBe('Order #42 shipped (pt-BR)');
    expect(mail.locale).toBe('pt-BR');
    await moduleRef.close();
  });

  it('passes the delivery idempotencyKey (derives the Message-ID) and the channel retry', async () => {
    const send = vi.fn(async (): Promise<MailTransportResult> => {
      throw new Error('smtp down');
    });
    const transport = Object.assign(new InMemoryMailTransport(), { send });
    const moduleRef = await app(transport, { retry: 2 });
    // Through the runner with an idempotency key, as the outbox handler does.
    const runner = moduleRef.get(ChannelRunner);
    const [res] = await runner.run(
      new User('ada@example.com') as Notifiable,
      new Welcome() as Notification,
      ['mail'],
      {
        idempotencyKey: 'msg-1',
      },
    );
    expect(res?.status).toBe('failed');
    expect(send).toHaveBeenCalledTimes(2); // retry: 2 attempts, overriding the module's retry: false
    const first = send.mock.calls[0] as unknown as [NestMailMessage, { idempotencyKey?: string }];
    expect(first[1].idempotencyKey).toBe('msg-1');
    await moduleRef.close();
  });

  it('downloads url attachments (official `path` is local only)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([37, 80, 68, 70]), {
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const mailbox = new InMemoryMailTransport();
    const moduleRef = await app(mailbox);
    await moduleRef.get(NotificationService).send(new User('ada@example.com'), new Remote());

    const attachment = mailbox.assertSent().attachment('report.pdf');
    expect(attachment.content.toString()).toBe('%PDF');
    expect(attachment.contentType).toBe('application/pdf');
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.com/report.pdf', {
      redirect: 'error',
    });
    await moduleRef.close();
  });

  it('routes per tenant with TenantRoutingMailTransport (tenant from the mail scope)', async () => {
    const acme = new InMemoryMailTransport();
    const fallback = new InMemoryMailTransport();
    const moduleRef = await app(
      new TenantRoutingMailTransport((tenant) => (tenant === 'acme' ? acme : undefined), fallback),
    );
    const notifications = moduleRef.get(NotificationService);
    await notifications.forTenant('acme').send(new User('a@acme.test'), new Welcome());
    await notifications.forTenant('other').send(new User('b@other.test'), new Welcome());
    await notifications.send(new User('c@single.test'), new Welcome());

    expect(acme.mails.map((m) => m.to[0]?.address)).toEqual(['a@acme.test']);
    expect(fallback.mails.map((m) => m.to[0]?.address)).toEqual(['b@other.test', 'c@single.test']);
    // No tenant leaks onto the message as a header.
    expect(Object.keys(acme.mails[0]?.headers ?? {})).not.toContain('X-Tenant');
    await moduleRef.close();
  });

  it('runs MailEvents subscribers inside the notification mail scope', async () => {
    const mailbox = new InMemoryMailTransport();
    const moduleRef = await app(mailbox);
    const scopes: unknown[] = [];
    moduleRef.get(MailEvents).events$.subscribe(() => scopes.push(currentMailScope()));
    await moduleRef
      .get(NotificationService)
      .forTenant('acme')
      .send(new User('ada@example.com'), new Welcome());
    expect(scopes).toEqual([{ tenant: 'acme', notification: 'Welcome' }]);
    await moduleRef.close();
  });

  it('fails the channel when toMail returns something else', async () => {
    class Broken {
      @Mail()
      toMail() {
        return { subject: 'nope' };
      }
    }
    const moduleRef = await app(new InMemoryMailTransport());
    const [result] = await moduleRef
      .get(NotificationService)
      .send(new User('ada@example.com'), new Broken());
    expect(result?.results[0]?.status).toBe('failed');
    expect(String(result?.results[0]?.error)).toMatch(/must return a MailMessage/);
    await moduleRef.close();
  });
});
