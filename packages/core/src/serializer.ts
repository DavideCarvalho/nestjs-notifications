import { Inject, Injectable } from '@nestjs/common';
import { NotificationSerializationError } from './errors';
import type {
  Notifiable,
  NotifiableRef,
  Notification,
  NotificationClass,
  NotificationJob,
  SerializedNotification,
} from './interfaces';
import type { NotificationsModuleOptions } from './options';
import { NOTIFICATION_OPTIONS } from './tokens';

/** Fully plain, JSON-safe form of a {@link NotificationJob} for cross-process transport. */
export interface SerializedJob {
  notifiable: NotifiableRef;
  notification: SerializedNotification;
  channels: string[];
  queue?: string;
}

/**
 * Turns live notification/notifiable objects into plain JSON for async dispatch and
 * rebuilds them inside a worker. Sync delivery never touches this.
 */
@Injectable()
export class NotificationSerializer {
  private readonly registry = new Map<string, NotificationClass>();

  constructor(
    @Inject(NOTIFICATION_OPTIONS)
    private readonly options: NotificationsModuleOptions,
  ) {
    for (const cls of options.notifications ?? []) {
      this.registry.set(this.nameOf(cls), cls);
    }
  }

  private nameOf(cls: NotificationClass): string {
    return cls.notificationName ?? cls.name;
  }

  serializeNotification(notification: Notification): SerializedNotification {
    const ctor = notification.constructor as NotificationClass;
    const name = ctor.notificationName ?? ctor.name;
    const data =
      typeof notification.serialize === 'function'
        ? notification.serialize()
        : { ...(notification as unknown as Record<string, unknown>) };
    return { name, data };
  }

  deserializeNotification(serialized: SerializedNotification): Notification {
    const cls = this.registry.get(serialized.name);
    if (!cls) {
      throw new NotificationSerializationError(
        `Cannot rehydrate notification "${serialized.name}": it is not listed in NotificationsModule.forRoot({ notifications: [...] }).`,
      );
    }
    if (typeof cls.deserialize === 'function') {
      return cls.deserialize(serialized.data);
    }
    const instance = Object.create(cls.prototype) as Notification;
    Object.assign(instance, serialized.data);
    return instance;
  }

  serializeNotifiable(notifiable: Notifiable): NotifiableRef {
    if (typeof notifiable.toNotifiableRef !== 'function') {
      throw new NotificationSerializationError(
        'Cannot dispatch asynchronously: the notifiable does not implement ' +
          'toNotifiableRef(). Add it so the worker can reload the recipient.',
      );
    }
    return notifiable.toNotifiableRef();
  }

  async resolveNotifiable(ref: NotifiableRef): Promise<Notifiable> {
    if (typeof this.options.resolveNotifiable !== 'function') {
      throw new NotificationSerializationError(
        'Cannot rehydrate notifiable: no resolveNotifiable() was provided to ' +
          'NotificationsModule.forRoot().',
      );
    }
    return this.options.resolveNotifiable(ref);
  }

  serializeJob(
    notifiable: Notifiable,
    notification: Notification,
    channels: string[],
  ): SerializedJob {
    return {
      notifiable: this.serializeNotifiable(notifiable),
      notification: this.serializeNotification(notification),
      channels,
      queue: notification.queue,
    };
  }

  /**
   * Serialize a {@link NotificationJob} (whose parts may still be live objects) into a
   * fully plain, JSON-safe payload. Used by cross-process dispatchers before enqueuing.
   */
  serialize(job: NotificationJob): SerializedJob {
    const notifiable = isRef(job.notifiable)
      ? job.notifiable
      : this.serializeNotifiable(job.notifiable);
    const notification = isSerialized(job.notification)
      ? job.notification
      : this.serializeNotification(job.notification);
    return { notifiable, notification, channels: job.channels, queue: job.queue };
  }

  async hydrateJob(
    job: NotificationJob,
  ): Promise<{ notifiable: Notifiable; notification: Notification }> {
    const notifiable = isRef(job.notifiable)
      ? await this.resolveNotifiable(job.notifiable)
      : job.notifiable;
    const notification = isSerialized(job.notification)
      ? this.deserializeNotification(job.notification)
      : job.notification;
    return { notifiable, notification };
  }
}

function isRef(value: Notifiable | NotifiableRef): value is NotifiableRef {
  return typeof (value as Notifiable).routeNotificationFor !== 'function';
}

function isSerialized(
  value: Notification | SerializedNotification,
): value is SerializedNotification {
  return typeof (value as Notification).via !== 'function';
}
