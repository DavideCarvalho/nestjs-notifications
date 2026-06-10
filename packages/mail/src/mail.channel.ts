import {
  type ChannelDriver,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { MailMessage } from './mail-message';
import type { MailRenderer } from './renderer';
import { MAIL_OPTIONS, MAIL_RENDERER, MAIL_TRANSPORT } from './tokens';
import type { MailTransport } from './transport';

/** Channel handle: use as `@Mail()` on a payload method, or as a token in `via()`. */
export const Mail = createChannel('mail');

/** Resolved runtime options for the mail channel. */
export interface MailChannelOptions {
  /** Default sender address used when a message does not set its own `from`. */
  from?: string;
}

/** Implement this on a notification to define its email payload. */
export interface MailNotification extends Notification {
  toMail(notifiable: Notifiable): MailMessage;
}

/**
 * Renders a notification's {@link MailMessage} and sends it through the configured
 * {@link MailTransport}. The recipient comes from `routeNotificationFor('mail')`.
 */
@Injectable()
export class MailChannel implements ChannelDriver {
  readonly channel = 'mail';

  constructor(
    @Inject(MAIL_TRANSPORT)
    private readonly transport: MailTransport,
    @Inject(MAIL_RENDERER)
    private readonly renderer: MailRenderer,
    @Inject(MAIL_OPTIONS)
    private readonly options: MailChannelOptions,
  ) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const recipient = String(routeFor(notifiable, 'mail', notification));

    const handler = getHandler(notification, 'mail', 'toMail');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('mail', 'toMail()', name);
    }

    const message = handler(notifiable) as MailMessage;
    const rendered = this.renderer.render(message);

    await this.transport.send({
      to: recipient,
      from: message.fromAddress ?? this.options.from,
      subject: message.subjectLine,
      html: rendered.html,
      text: rendered.text,
    });
  }
}
