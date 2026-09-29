import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { MailMessage } from './mail-message';
import type { MailRenderer } from './renderer';
import { MAIL_OPTIONS, MAIL_RENDERER, MAIL_TRANSPORT, MAIL_TRANSPORT_RESOLVER } from './tokens';
import type { MailTransport } from './transport';

/** Channel handle: use as `@Mail()` on a payload method, or as a token in `via()`. */
export const Mail = createChannel('mail');

/** Resolved runtime options for the mail channel. */
export interface MailChannelOptions {
  /** Default sender address used when a message does not set its own `from`. */
  from?: string | undefined;
}

/** Implement this on a notification to define its email payload. */
export interface MailNotification extends Notification {
  /**
   * Build the email. The `ctx` carries the recipient and the resolved localization (locale +
   * translator) so the message can be localized: `toMail({ notifiable, localization }) => ...`.
   * Ignoring `localization` renders exactly as before.
   */
  toMail(ctx: ChannelContext): MailMessage;
}

/**
 * Resolves the per-tenant {@link MailTransport} from a tenant id. May be async (e.g. load the
 * tenant's SMTP credentials from a database); the channel awaits it on tenant-scoped deliveries.
 */
export type MailTransportResolver = (tenant: string) => MailTransport | Promise<MailTransport>;

/**
 * Renders a notification's {@link MailMessage} and sends it through the configured
 * {@link MailTransport}. The recipient comes from `routeNotificationFor('mail')`.
 */
@Injectable()
export class MailChannel extends BaseChannel {
  readonly channel = 'mail';

  constructor(
    @Inject(MAIL_TRANSPORT)
    private readonly defaultTransport: MailTransport,
    @Inject(MAIL_RENDERER)
    private readonly renderer: MailRenderer,
    @Inject(MAIL_OPTIONS)
    private readonly options: MailChannelOptions,
    @Optional()
    @Inject(MAIL_TRANSPORT_RESOLVER)
    private readonly resolveTransport?: MailTransportResolver,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const recipient = String(routeFor(notifiable, 'mail', notification));
    const message = this.buildPayload<MailMessage>(notification, notifiable, 'toMail', context);
    const rendered = await this.renderer.render(message);
    // The resolver may be async (e.g. per-tenant SMTP credentials from a database).
    const transport = await this.forTenant<MailTransport | Promise<MailTransport>>(
      this.defaultTransport,
      context,
      this.resolveTransport,
    );

    await transport.send({
      to: recipient,
      from: message.fromAddress ?? this.options.from,
      subject: message.subjectLine,
      html: rendered.html,
      text: rendered.text,
      ...(message.attachments.length ? { attachments: message.attachments } : {}),
    });
  }
}
