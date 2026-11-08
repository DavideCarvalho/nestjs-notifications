import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { MailChannel, type MailChannelOptions } from './mail.channel';
import { DefaultMailRenderer, type MailRenderer } from './renderer';
import { MAIL_OPTIONS, MAIL_RENDERER } from './tokens';

export interface MailChannelModuleOptions extends MailChannelOptions {
  /** Custom renderer class. Defaults to {@link DefaultMailRenderer}. */
  renderer?: Type<MailRenderer>;
  /** A pre-built renderer instance. Takes precedence over `renderer`. */
  rendererInstance?: MailRenderer;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the mail channel. Sending is `@nestjs/mail`'s: configure `MailModule.forRoot()`
 * (transport, default `from`, retries; https://docs.nestjs.com/application/mail) next to it.
 *
 * ```ts
 * MailModule.forRoot({ transport: new SmtpTransport({ host, port, auth }), from: 'no-reply@example.com' }),
 * MailChannelModule.forRoot({ renderer: MarkdownMailRenderer }),
 * ```
 */
@Module({})
export class MailChannelModule {
  static forRoot(options: MailChannelModuleOptions = {}): DynamicModule {
    const mailOptions: MailChannelOptions = {
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
      ...(options.attachments !== undefined ? { attachments: options.attachments } : {}),
    };
    const rendererClass = options.renderer ?? DefaultMailRenderer;

    const providers: Provider[] = [{ provide: MAIL_OPTIONS, useValue: mailOptions }, MailChannel];
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
