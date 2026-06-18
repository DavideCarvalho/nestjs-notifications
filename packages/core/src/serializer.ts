import { Inject, Injectable } from '@nestjs/common';
import type { CapturedContext } from './context-accessor';
import { notifiableRef } from './decorators';
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
  queue?: string | undefined;
  tenant?: string | undefined;
  /**
   * The request context captured at send() time. JSON-safe ({@link CapturedContext} is all
   * primitives), so it rides through Redis/BullMQ and is re-established on the worker — an
   * async-delivered notification still records WHO triggered it.
   */
  captured?: CapturedContext | undefined;
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
    try {
      // Uses toNotifiableRef() if present, else the @Notifiable/@NotifiableId decorators.
      return notifiableRef(notifiable);
    } catch (error) {
      throw new NotificationSerializationError(
        error instanceof Error ? error.message : String(error),
      );
    }
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
    return {
      notifiable,
      notification,
      channels: job.channels,
      queue: job.queue,
      tenant: job.tenant,
      captured: job.captured,
    };
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
  // A NotifiableRef is a plain { type, id } object; a live notifiable is a class instance.
  // (Can't rely on routeNotificationFor — it's optional now that @RouteFor decorators exist.)
  const candidate = value as NotifiableRef;
  return (
    typeof candidate.type === 'string' &&
    (typeof candidate.id === 'string' || typeof candidate.id === 'number') &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isSerialized(
  value: Notification | SerializedNotification,
): value is SerializedNotification {
  // The serialized wire form is a plain { name, data } object; a live notification is a
  // class instance with a custom prototype. (Can't rely on `via` — it's optional now that
  // channels can be declared with decorators.)
  const candidate = value as SerializedNotification;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.data === 'object' &&
    candidate.data !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
