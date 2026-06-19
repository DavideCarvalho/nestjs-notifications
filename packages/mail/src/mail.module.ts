import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { MailChannel, type MailChannelOptions } from './mail.channel';
import { DefaultMailRenderer, type MailRenderer } from './renderer';
import {
  MAIL_OPTIONS,
  MAIL_RENDERER,
  MAIL_SMTP_OPTIONS,
  MAIL_TRANSPORT,
  MAIL_TRANSPORT_RESOLVER,
} from './tokens';
import { type MailTransport, NodemailerTransport, type SMTPOptions } from './transport';

export interface MailChannelModuleOptions {
  /** Default sender address for messages that don't set their own. */
  from?: string;
  /** Custom transport class. Defaults to {@link NodemailerTransport}. */
  transport?: Type<MailTransport>;
  /**
   * A pre-built transport instance. Use this for transports that need constructor args, such
   * as a `resilientTransport()` from `@dudousxd/nestjs-notifications-resilience`. Takes precedence over `transport`.
   */
  transportInstance?: MailTransport;
  /** Custom renderer class. Defaults to {@link DefaultMailRenderer}. */
  renderer?: Type<MailRenderer>;
  /** A pre-built renderer instance. Takes precedence over `renderer`. */
  rendererInstance?: MailRenderer;
  /** SMTP options for the default nodemailer transport. */
  smtp?: SMTPOptions;
  /**
   * Resolve a per-tenant transport. When delivery runs with a `context.tenant`, the
   * channel uses the returned transport instead of the default. Lets each tenant use
   * its own SMTP/provider.
   */
  resolveTransport?: (tenant: string) => MailTransport;
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
      { provide: MAIL_TRANSPORT_RESOLVER, useValue: options.resolveTransport },
      MailChannel,
    ];

    if (options.transportInstance) {
      providers.push({ provide: MAIL_TRANSPORT, useValue: options.transportInstance });
    } else {
      providers.push(transportClass, { provide: MAIL_TRANSPORT, useExisting: transportClass });
    }

    if (options.rendererInstance) {
      providers.push({ provide: MAIL_RENDERER, useValue: options.rendererInstance });
    } else {
      providers.push(rendererClass, { provide: MAIL_RENDERER, useExisting: rendererClass });
    }

    return {
      module: MailChannelModule,
      global: options.global ?? true,
      providers,
      exports: [MailChannel],
    };
  }
}
