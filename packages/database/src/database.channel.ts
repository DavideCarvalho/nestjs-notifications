import {
  type ChannelDriver,
  type Notifiable,
  type NotifiableRef,
  type Notification,
  createChannel,
  getHandler,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseNotification, NotificationStore } from './interfaces';
import { NOTIFICATION_STORE } from './tokens';

/** Channel handle: use as `@Database()` on a payload method, or as a token in `via()`. */
export const Database = createChannel('database');

/**
 * Persists notifications via a {@link NotificationStore} so they can be shown in-app.
 * Reads the payload from `toDatabase()`, then `toArray()`, then a structural copy.
 */
@Injectable()
export class DatabaseChannel implements ChannelDriver {
  readonly channel = 'database';

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
  ) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const ref = this.referenceFor(notifiable, notification);
    const data = this.payloadFor(notifiable, notification);
    const type =
      (notification.constructor as { notificationName?: string }).notificationName ??
      notification.constructor.name;

    await this.store.save({
      type,
      notifiableType: ref.type,
      notifiableId: String(ref.id),
      data,
    });
  }

  private referenceFor(notifiable: Notifiable, notification: Notification): NotifiableRef {
    const routed = notifiable.routeNotificationFor('database', notification);
    if (isRef(routed)) return routed;
    if (typeof notifiable.toNotifiableRef === 'function') return notifiable.toNotifiableRef();
    throw new Error(
      'The database channel needs a notifiable reference. Implement toNotifiableRef() on the ' +
        'notifiable, or return { type, id } from routeNotificationFor("database").',
    );
  }

  private payloadFor(
    notifiable: Notifiable,
    notification: DatabaseNotification,
  ): Record<string, unknown> {
    const handler = getHandler(notification, 'database', 'toDatabase');
    if (handler) return handler(notifiable) as Record<string, unknown>;
    if (typeof notification.toArray === 'function') return notification.toArray(notifiable);
    const { ...rest } = notification as unknown as Record<string, unknown>;
    return rest;
  }
}

function isRef(value: unknown): value is NotifiableRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'id' in value &&
    typeof (value as NotifiableRef).type === 'string'
  );
}
