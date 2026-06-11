import {
  type ChannelDriver,
  type DeliveryContext,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PushMessage } from './push-message';
import { PUSH_TRANSPORT, PUSH_TRANSPORT_RESOLVER } from './tokens';
import type { PushTransport } from './transport';

/** Resolves a per-tenant {@link PushTransport} from a tenant id. */
export type PushTransportResolver = (tenant: string) => PushTransport;

/** Channel handle: use as `@Push()` on a payload method, or as a token in `via()`. */
export const Push = createChannel('push');

/** Implement this on a notification to define its push payload. */
export interface PushNotification extends Notification {
  toPush(notifiable: Notifiable): PushMessage;
}

/**
 * Delivers a notification's {@link PushMessage} through the configured
 * {@link PushTransport}. The target(s) come from `routeNotificationFor('push')`:
 * a single device token / subscription, or an array of them (each gets the message).
 */
@Injectable()
export class PushChannel implements ChannelDriver {
  readonly channel = 'push';

  constructor(
    @Inject(PUSH_TRANSPORT)
    private readonly transport: PushTransport,
    @Optional()
    @Inject(PUSH_TRANSPORT_RESOLVER)
    private readonly resolveTransport?: PushTransportResolver,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const transport =
      context?.tenant && this.resolveTransport
        ? this.resolveTransport(context.tenant)
        : this.transport;
    const target = routeFor(notifiable, 'push', notification);

    const handler = getHandler(notification, 'push', 'toPush');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('push', 'toPush()', name);
    }

    const message = handler(notifiable) as PushMessage;

    if (Array.isArray(target)) {
      for (const one of target) {
        await transport.send(one, message);
      }
      return;
    }

    await transport.send(target, message);
  }
}
