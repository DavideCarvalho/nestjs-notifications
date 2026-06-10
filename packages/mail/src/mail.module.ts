import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { MailChannel, type MailChannelOptions } from './mail.channel';
import { DefaultMailRenderer, type MailRenderer } from './renderer';
import { MAIL_OPTIONS, MAIL_RENDERER, MAIL_SMTP_OPTIONS, MAIL_TRANSPORT } from './tokens';
import { type MailTransport, NodemailerTransport, type SMTPOptions } from './transport';

export interface MailChannelModuleOptions {
  /** Default sender address for messages that don't set their own. */
  from?: string;
  /** Custom transport class. Defaults to {@link NodemailerTransport}. */
  transport?: Type<MailTransport>;
  /** Custom renderer class. Defaults to {@link DefaultMailRenderer}. */
  renderer?: Type<MailRenderer>;
  /** SMTP options for the default nodemailer transport. */
  smtp?: SMTPOptions;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the mail channel.
 *
 * ```ts
 * MailChannelModule.forRoot({
 *   from: 'no-reply@example.com',
 *   smtp: { host: 'smtp.example.com', port: 587, auth: { user, pass } },
 * });
 * ```
 */
@Module({})
export class MailChannelModule {
  static forRoot(options: MailChannelModuleOptions = {}): DynamicModule {
    const mailOptions: MailChannelOptions = { from: options.from };
    const transportClass = options.transport ?? NodemailerTransport;
    const rendererClass = options.renderer ?? DefaultMailRenderer;

    const providers: Provider[] = [
      { provide: MAIL_OPTIONS, useValue: mailOptions },
      { provide: MAIL_SMTP_OPTIONS, useValue: options.smtp ?? {} },
      transportClass,
      { provide: MAIL_TRANSPORT, useExisting: transportClass },
      rendererClass,
      { provide: MAIL_RENDERER, useExisting: rendererClass },
      MailChannel,
    ];

    return {
      module: MailChannelModule,
      global: options.global ?? true,
      providers,
      exports: [MailChannel],
    };
  }
}
