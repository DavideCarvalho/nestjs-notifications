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
import type { SmsMessage } from './sms-message';
import { SMS_OPTIONS, SMS_TRANSPORT, SMS_TRANSPORT_RESOLVER } from './tokens';
import type { SmsTransport } from './transport';

/** Resolves a per-tenant {@link SmsTransport} from a tenant id. */
export type SmsTransportResolver = (tenant: string) => SmsTransport;

/** Channel handle: use as `@Sms()` on a payload method, or as a token in `via()`. */
export const Sms = createChannel('sms');

/** Resolved runtime options for the sms channel. */
export interface SmsChannelOptions {
  /** Default sender number used when a message does not set its own `from`. */
  from?: string | undefined;
}

/** Implement this on a notification to define its SMS payload. */
export interface SmsNotification extends Notification {
  toSms(ctx: ChannelContext): SmsMessage | string;
}

/**
 * Sends a notification's SMS body through the configured {@link SmsTransport}. The
 * recipient comes from `routeNotificationFor('sms')`.
 */
@Injectable()
export class SmsChannel extends BaseChannel {
  readonly channel = 'sms';

  constructor(
    @Inject(SMS_TRANSPORT)
    private readonly transport: SmsTransport,
    @Inject(SMS_OPTIONS)
    private readonly options: SmsChannelOptions,
    @Optional()
    @Inject(SMS_TRANSPORT_RESOLVER)
    private readonly resolveTransport?: SmsTransportResolver,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const transport = this.forTenant(this.transport, context, this.resolveTransport);
    const recipient = String(routeFor(notifiable, 'sms', notification));
    const result = this.buildPayload<SmsMessage | string>(
      notification,
      notifiable,
      'toSms',
      context,
    );

    const text = typeof result === 'string' ? result : result.text;
    const msgFrom = typeof result === 'string' ? undefined : result.fromNumber;

    await transport.send({
      to: recipient,
      from: msgFrom ?? this.options.from,
      text,
    });
  }
}
