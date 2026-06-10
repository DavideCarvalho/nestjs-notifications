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
 * Anything that can receive notifications. Two ways to declare per-channel addresses:
 *
 * - **Decorators** (idiomatic): annotate properties with `@RouteFor('mail')` etc. and mark
 *   the id with `@NotifiableId()`; the address is then read off the property.
 * - **`routeNotificationFor`**: implement it for dynamic/computed routing — it overrides the
 *   decorators.
 *
 * `toNotifiableRef` (or `@Notifiable()` + `@NotifiableId()`) is only needed for async dispatch.
 */
export interface Notifiable {
  /** Optional explicit per-channel address resolver; overrides `@RouteFor` decorators. */
  routeNotificationFor?(channel: string, notification: Notification): unknown;
  /**
   * Required (or replaced by `@Notifiable()`/`@NotifiableId()`) only when this notifiable may
   * be dispatched asynchronously. Returns a serializable reference so the worker can reload it.
   */
  toNotifiableRef?(): NotifiableRef;
}

/**
 * A notifiable instance accepted by the public API: a plain class carrying `@RouteFor`
 * decorators, or any object implementing the {@link Notifiable} contract. Kept loose so a
 * decorator-only class is accepted.
 */
export type NotifiableInput = object;

/** Options for the {@link Notifiable} class decorator. */
export interface NotifiableOptions {
  /** Morph type used in the async reference; defaults to the class name. */
  type?: string;
}

/**
 * Optional class marker for a notifiable. Pins the morph `type` used in the async reference
 * (defaults to the class name). Pair with `@NotifiableId()` to drop `toNotifiableRef()`.
 */
export function Notifiable(options: NotifiableOptions = {}): ClassDecorator {
  return (target) => {
    if (options.type) {
      Object.defineProperty(target, 'notifiableType', { value: options.type, configurable: true });
    }
  };
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
   * Delay delivery. A number of milliseconds or an absolute `Date`. A delay routes the
   * notification through the async dispatcher (honored by BullMQ/Redis/event-emitter).
   */
  delay?: number | Date;
  /**
   * Per-channel gate, evaluated just before delivery (Laravel's `shouldSend`). Return
   * `false` to skip that channel for this notifiable (recorded as `skipped`).
   */
  shouldSend?(notifiable: Notifiable, channel: string): boolean;
  /** Lifecycle hook called after a channel delivers, with the channel's transport response. */
  afterSending?(notifiable: Notifiable, channel: string, response: unknown): void | Promise<void>;
  /**
   * Custom serialization for async dispatch. Defaults to a structural copy of the
   * instance's own enumerable properties.
   */
  serialize?(): Record<string, unknown>;
}

/** Outcome of delivering a notification on one channel. */
export type ChannelDeliveryStatus = 'sent' | 'failed' | 'skipped' | 'queued';

/** Per-channel result returned from a send. */
export interface ChannelResult {
  channel: string;
  status: ChannelDeliveryStatus;
  /** The channel transport's response, when it returns one (sent only). */
  response?: unknown;
  /** The error that occurred (failed only). */
  error?: unknown;
}

/** Result of sending a notification to one notifiable. */
export interface SendResult {
  notifiable: Notifiable;
  results: ChannelResult[];
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
  /** Deliver; may return the transport's response (passed to `afterSending` and SendResult). */
  send(notifiable: Notifiable, notification: Notification): Promise<unknown>;
}

/** A unit of work handed to a {@link DispatchDriver}. */
export interface NotificationJob {
  notifiable: Notifiable | NotifiableRef;
  notification: Notification | SerializedNotification;
  channels: string[];
  queue?: string;
  /** Delivery delay in milliseconds (honored by async dispatchers). */
  delay?: number;
}

/** Decides where/when a job is processed: inline, in-process events, Redis, BullMQ. */
export interface DispatchDriver {
  dispatch(job: NotificationJob): Promise<void>;
}

/** Behaviour when a single channel throws. */
export type ErrorPolicy = 'continueOnError' | 'failFast';
