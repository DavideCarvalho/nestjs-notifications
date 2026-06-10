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
 * A type-safe reference to a channel, exported by each channel package (`Mail`,
 * `Database`, ...). Usable both as a method decorator (`@Mail()`) and as a value in
 * `via()` (`return [Mail, Database]`) — no magic strings.
 */
export interface ChannelRef {
  readonly channel: string;
}

/**
 * A notification. The channels can be declared two ways:
 *
 * - **Decorators** (idiomatic): annotate payload methods with the channel handles
 *   (`@Mail()`, `@Database()`); `via` is then inferred automatically.
 * - **Explicit `via`**: implement `via()` (returning channel names or {@link ChannelRef}
 *   handles) when you need per-recipient conditional routing — it overrides inference.
 *
 * Per-channel payload methods (`toMail`, `toDatabase`, ...) are typed by implementing the
 * matching interface exported by each channel package, or carry a channel decorator.
 */
export interface Notification {
  /** Optional explicit channel list; overrides decorator inference when present. */
  via?(notifiable: Notifiable): Array<string | ChannelRef>;
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

/**
 * A notification instance accepted by the public API: a plain class carrying channel
 * decorators, or any object implementing the {@link Notification} contract. Kept loose so
 * a decorator-only class (which shares no member with {@link Notification}) is accepted.
 */
export type NotificationInput = object;

/** Options for the {@link Notification} class decorator. */
export interface NotificationOptions {
  /** Stable name used in the async rehydration registry; defaults to the class name. */
  name?: string;
}

/**
 * Optional class marker for a notification. Its main use is pinning a stable
 * `notificationName` so async (de)serialization survives a class rename:
 *
 * ```ts
 * @Notification({ name: 'invoice.paid' })
 * export class InvoicePaid { ... }
 * ```
 *
 * Channel inference works with or without it — it reads the channel decorators.
 */
export function Notification(options: NotificationOptions = {}): ClassDecorator {
  return (target) => {
    if (options.name) {
      Object.defineProperty(target, 'notificationName', {
        value: options.name,
        configurable: true,
      });
    }
  };
}

/** Constructor of a notification, optionally with a custom deserializer. */
export interface NotificationClass {
  new (...args: any[]): object;
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
