import {
  type ChannelDriver,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { PushMessage } from './push-message';
import { PUSH_TRANSPORT } from './tokens';
import type { PushTransport } from './transport';

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
  ) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const target = notifiable.routeNotificationFor('push', notification);

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
        await this.transport.send(one, message);
      }
      return;
    }

    await this.transport.send(target, message);
  }
}
