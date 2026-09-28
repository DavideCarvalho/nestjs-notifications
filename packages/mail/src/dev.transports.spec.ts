import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogMailTransport, NullMailTransport } from './dev.transports';
import { MailMessage } from './mail-message';
import { MailChannel } from './mail.channel';
import { MailChannelModule } from './mail.module';
import { DefaultMailRenderer } from './renderer';
import { MAIL_SMTP_OPTIONS, MAIL_TRANSPORT } from './tokens';
import { NodemailerTransport } from './transport';

const payload = {
  to: 'ada@example.com',
  from: 'no-reply@example.com',
  subject: 'You are invited',
  html: '<p>Join</p>',
  text: 'Join: https://app.example.com/invite/abc',
};

describe('LogMailTransport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the recipient, subject and text body instead of sending', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await new LogMailTransport().send({
      ...payload,
      attachments: [{ filename: 'invoice.pdf', content: 'x' }],
    });
    expect(log).toHaveBeenCalledOnce();
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('to=ada@example.com');
    expect(line).toContain('subject="You are invited"');
    expect(line).toContain('attachments=invoice.pdf');
    expect(line).toContain('https://app.example.com/invite/abc');
  });

  it('works as the channel transport end-to-end', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const channel = new MailChannel(new LogMailTransport(), new DefaultMailRenderer(), {
      from: 'no-reply@example.com',
    });
    await channel.send({ routeNotificationFor: () => 'ada@example.com' }, {
      via: () => ['mail'],
      toMail: () => new MailMessage().subject('Hi').line('Hello'),
    } as never);
    expect(String(log.mock.calls[0]?.[0])).toContain('subject="Hi"');
  });
});

describe('NullMailTransport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drops the message, logging only at debug level', async () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log');
    await expect(new NullMailTransport().send(payload)).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    expect(String(debug.mock.calls[0]?.[0])).not.toContain('invite/abc');
  });
});

describe('NodemailerTransport with an SMTP connection URL', () => {
  it('accepts a URL string and the module forwards it', () => {
    const module = MailChannelModule.forRoot({ smtp: 'smtp://user:pass@relay.internal:2525' });
    const smtp = (module.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === MAIL_SMTP_OPTIONS,
    ) as { useValue: unknown } | undefined;
    expect(smtp?.useValue).toBe('smtp://user:pass@relay.internal:2525');

    const transport = new NodemailerTransport('smtp://user:pass@relay.internal:2525');
    const options = (transport as unknown as { transporter: { options: Record<string, unknown> } })
      .transporter.options;
    expect(options).toMatchObject({ host: 'relay.internal', port: 2525 });
  });

  it('can select the log / null transports via transport or transportInstance', () => {
    const byClass = MailChannelModule.forRoot({ transport: LogMailTransport });
    expect(byClass.providers).toContain(LogMailTransport);
    const byInstance = MailChannelModule.forRoot({ transportInstance: new NullMailTransport() });
    const bound = (byInstance.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === MAIL_TRANSPORT,
    ) as { useValue: unknown } | undefined;
    expect(bound?.useValue).toBeInstanceOf(NullMailTransport);
  });
});
