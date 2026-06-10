/**
 * A stable reference to a notifiable, used when a notification crosses a process
 * boundary (async dispatch). The worker reloads the real object via
 * {@link NotificationsModuleOptions.resolveNotifiable}.
 */
export interface NotifiableRef {
  type: string;
  id: string | number;
}

/**
 * Anything that can receive notifications. Mirrors Laravel's `Notifiable` trait:
 * `routeNotificationFor` returns the per-channel "address" (an email, a phone number,
 * a websocket room, or the object itself).
 */
export interface Notifiable {
  routeNotificationFor(channel: string, notification: Notification): unknown;
  /**
   * Required only when this notifiable may be dispatched asynchronously. Returns a
   * serializable reference so the worker can reload it. Sync delivery never needs it.
   */
  toNotifiableRef?(): NotifiableRef;
}

/** The wire form of a notification once serialized for async dispatch. */
export interface SerializedNotification {
  name: string;
  data: Record<string, unknown>;
}

/**
 * A notification. Implement `via` to declare which channels to use for a given
 * notifiable. Per-channel payload methods (`toMail`, `toDatabase`, ...) are added by
 * implementing the matching interface exported by each channel package.
 */
export interface Notification {
  via(notifiable: Notifiable): string[];
  /** Route through the configured async dispatch driver instead of sending inline. */
  shouldQueue?: boolean;
  /** Optional queue/driver hint passed through to the dispatcher. */
  queue?: string;
  /**
   * Custom serialization for async dispatch. Defaults to a structural copy of the
   * instance's own enumerable properties.
   */
  serialize?(): Record<string, unknown>;
}

/** Constructor of a {@link Notification}, optionally with a custom deserializer. */
export interface NotificationClass {
  new (...args: any[]): Notification;
  /** Stable name used in the rehydration registry; defaults to the class name. */
  readonly notificationName?: string;
  /** Custom rebuild from serialized data. Defaults to assigning data onto the prototype. */
  deserialize?(data: Record<string, unknown>): Notification;
}

/** Delivers a notification over a single transport (mail, database, slack, ...). */
export interface ChannelDriver {
  readonly channel: string;
  send(notifiable: Notifiable, notification: Notification): Promise<void>;
}

/** A unit of work handed to a {@link DispatchDriver}. */
export interface NotificationJob {
  notifiable: Notifiable | NotifiableRef;
  notification: Notification | SerializedNotification;
  channels: string[];
  queue?: string;
}

/** Decides where/when a job is processed: inline, in-process events, Redis, BullMQ. */
export interface DispatchDriver {
  dispatch(job: NotificationJob): Promise<void>;
}

/** Behaviour when a single channel throws. */
export type ErrorPolicy = 'continueOnError' | 'failFast';
