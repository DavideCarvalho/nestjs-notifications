import {
  type ChannelDriver,
  type DeliveryContext,
  type Notifiable,
  type NotifiableRef,
  type Notification,
  createChannel,
  getHandler,
  notifiableRef,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<unknown> {
    const ref = this.referenceFor(notifiable, notification);
    const data = this.payloadFor(notifiable, notification);
    const type =
      (notification.constructor as { notificationName?: string }).notificationName ??
      notification.constructor.name;

    const input = {
      type,
      notifiableType: ref.type,
      notifiableId: String(ref.id),
      tenantId: context?.tenant ?? null,
      data,
    };

    // A stable databaseKey means "update this row in place" (live/progress notifications).
    const key = this.upsertKeyFor(notifiable, notification);
    if (key != null) {
      if (typeof this.store.upsert === 'function') {
        return this.store.upsert({ id: key, ...input });
      }
      this.logger.warn(
        `Notification "${type}" returned a databaseKey but the store does not implement upsert(); inserting a new row instead. Implement NotificationStore.upsert to update in place.`,
      );
    }

    // Return the stored row so it flows into afterSending() and the SendResult.
    return this.store.save(input);
  }

  private upsertKeyFor(
    notifiable: Notifiable,
    notification: DatabaseNotification,
  ): string | undefined {
    return typeof notification.databaseKey === 'function'
      ? notification.databaseKey(notifiable)
      : undefined;
  }

  private referenceFor(notifiable: Notifiable, notification: Notification): NotifiableRef {
    // A { type, id } returned from the 'database' route wins; otherwise derive the ref from
    // toNotifiableRef() or the @Notifiable/@NotifiableId decorators.
    const routed = routeFor(notifiable, 'database', notification);
    if (isRef(routed)) return routed;
    return notifiableRef(notifiable);
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
