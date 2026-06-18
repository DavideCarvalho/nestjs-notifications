import type { CapturedContext } from './context-accessor';
import type { Localization } from './localization';

export type { CapturedContext } from './context-accessor';

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

/**
 * Outcome of delivering a notification on one channel.
 * - `suppressed`: dropped as a duplicate by the idempotency guard.
 * - `throttled`: dropped (or, when deferred, not delivered now) by the rate-limit guard.
 * - `deferred`: held back by the preference gate (e.g. quiet hours) and re-queued through the
 *   async dispatcher to deliver after the window — not dropped.
 */
export type ChannelDeliveryStatus =
  | 'sent'
  | 'failed'
  | 'skipped'
  | 'queued'
  | 'suppressed'
  | 'throttled'
  | 'deferred';

/** Per-channel result returned from a send. */
export interface ChannelResult {
  channel: string;
  status: ChannelDeliveryStatus;
  /** The channel transport's response, when it returns one (sent only). */
  response?: unknown;
  /** The error that occurred (failed only). */
  error?: unknown;
}

/** Result of sending a notification to one notifiable (within one tenant, if scoped). */
export interface SendResult {
  notifiable: Notifiable;
  results: ChannelResult[];
  /** The tenant this delivery was scoped to, when multi-tenant (`undefined` = single-tenant). */
  tenant?: string | undefined;
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

/**
 * Per-delivery context threaded to channels. `tenant` scopes config and storage in
 * multi-tenant apps (set via `notifications.forTenant(id)`); undefined = single-tenant.
 */
export interface DeliveryContext {
  tenant?: string | undefined;
  /**
   * The request context captured at `send()` time — who triggered the notification
   * (`causer`), the tenant it happened in, and the correlation `traceId`. Populated only
   * when `@dudousxd/nestjs-context` is installed and an accessor is bound; otherwise
   * `undefined` and channels behave exactly as before. Survives async dispatch so a
   * worker-delivered notification still records WHO triggered it.
   */
  captured?: CapturedContext | undefined;
  /**
   * Set when this delivery is the re-queued tail of a gate `defer` (e.g. quiet hours): the
   * preference gate is bypassed so the deferred channel actually delivers instead of being
   * deferred again in an infinite loop. Carries the channels that were deferred.
   */
  deferredChannels?: string[] | undefined;
  /**
   * The resolved locale + translator for this delivery, populated by the runner from the bound
   * {@link LocaleResolver}/{@link Translator}. Channels pass it on the {@link ChannelContext} given
   * to a notification's payload handler (`toMail(ctx)`) so templates/strings can be localized.
   * Undefined when no resolver/translator is bound (behavior unchanged).
   */
  localization?: Localization;
}

/**
 * The single argument every channel payload method receives — `toMail(ctx)`, `toSms(ctx)`, … .
 * Destructure what you need; an object (rather than positional args) keeps the signature stable as
 * more context is threaded through over time.
 */
export interface ChannelContext {
  /** The recipient this payload is being built for. */
  notifiable: Notifiable;
  /**
   * The resolved locale + translator for this delivery, when [localization](../concepts/localization)
   * is configured. Use `localization.t(key, params)` to render in the recipient's language; absent
   * when no resolver/translator is bound.
   */
  localization?: Localization;
  /** The tenant this delivery is scoped to, when multi-tenant; `undefined` in single-tenant apps. */
  tenant?: string | undefined;
}

/** Delivers a notification over a single transport (mail, database, slack, ...). */
export interface ChannelDriver {
  readonly channel: string;
  /**
   * Deliver; may return the transport's response (passed to `afterSending` and SendResult).
   * `context.tenant` lets a channel resolve per-tenant config/storage.
   */
  send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<unknown>;
}

/** A unit of work handed to a {@link DispatchDriver}. */
export interface NotificationJob {
  notifiable: Notifiable | NotifiableRef;
  notification: Notification | SerializedNotification;
  channels: string[];
  queue?: string | undefined;
  /** Delivery delay in milliseconds (honored by async dispatchers). */
  delay?: number | undefined;
  /** Tenant scope for this job (multi-tenant apps). */
  tenant?: string | undefined;
  /**
   * The request context captured when the notification was sent. Cross-process dispatchers
   * include this in the job payload and re-establish it on the worker, so an async-delivered
   * notification still records its `causer`/`tenantId`/`traceId`. JSON-safe by construction.
   */
  captured?: CapturedContext | undefined;
  /**
   * Channels that were deferred by the preference gate (e.g. quiet hours) and re-queued. When
   * the worker runs this job those channels bypass the gate so they deliver instead of being
   * deferred again. JSON-safe (array of strings).
   */
  deferredChannels?: string[] | undefined;
}

/** Decides where/when a job is processed: inline, in-process events, Redis, BullMQ. */
export interface DispatchDriver {
  dispatch(job: NotificationJob): Promise<void>;
}

/** Context handed to a {@link PreferenceGate} before a channel is delivered. */
export interface ChannelGateContext {
  notifiable: Notifiable;
  notification: Notification;
  channel: string;
  tenant?: string | undefined;
}

/**
 * Outcome of consulting a {@link PreferenceGate} for one channel:
 *
 * - `allow` — deliver the channel now.
 * - `skip` — drop the channel for this notifiable (recorded as `skipped`); the notification is
 *   gone for this channel (e.g. the user muted it, or its digest cadence is not instant).
 * - `defer` — do NOT deliver now, but DO NOT drop it: the runner re-queues the channel through
 *   the async dispatcher to deliver after `deferUntil` (e.g. quiet hours). Recorded as
 *   `deferred`.
 */
export type GateAction = 'allow' | 'skip' | 'defer';

/**
 * A digest cadence carried on a `skip` {@link GateDecision}: the channel is not delivered
 * instantly, but the notification must NOT be lost — instead it is collected into a pending
 * digest and sent in a batch at the chosen `cadence`. Set by the preference gate when the
 * notifiable's category cadence is `daily`/`weekly`.
 */
export interface DigestDecision {
  /** Batching window. */
  cadence: 'daily' | 'weekly';
  /** The resolved category key (used as the digest group key). */
  category: string;
}

/** Rich gate decision, returned by the optional {@link PreferenceGate.evaluate}. */
export interface GateDecision {
  action: GateAction;
  /**
   * For `defer`: an absolute epoch-ms timestamp the channel should be delivered at (the end of
   * the quiet-hours window). The runner schedules the re-queue with this delay. Ignored for
   * other actions.
   */
  deferUntil?: number;
  /**
   * For `skip`: when present, the channel is suppressed for instant delivery but the
   * notification must be COLLECTED into a periodic digest (not dropped). The runner forwards it
   * to a {@link DigestSink} when one is bound; absent, the channel is dropped as before. Purely
   * additive — gates that don't set it behave exactly as before.
   */
  digest?: DigestDecision;
}

/**
 * A delivery the gate has decided to batch into a periodic digest instead of dropping. Carries
 * everything the digest collector needs to re-dispatch the batch later: WHO it was for, the
 * category/cadence group key, the tenant scope, and the live notification (the collector
 * serializes it for storage). Bound under {@link NOTIFICATION_DIGEST_SINK}; absent, a `skip`
 * with a digest cadence falls back to the legacy drop behavior.
 */
export interface DigestSink {
  collect(entry: {
    notifiable: Notifiable;
    notification: Notification;
    channel: string;
    cadence: 'daily' | 'weekly';
    category: string;
    tenant?: string | undefined;
  }): Promise<void>;
}

/**
 * Optional app-wide gate consulted before each channel delivery — return `false` from
 * {@link isAllowed} to skip the channel (recorded as `skipped`). The preferences package
 * provides one backed by a store; bind your own under the `NOTIFICATION_PREFERENCE_GATE` token.
 *
 * A gate MAY additionally implement {@link evaluate} for a richer decision (allow / skip /
 * defer). When present the runner prefers it; otherwise it falls back to {@link isAllowed},
 * keeping every existing boolean gate fully backward-compatible.
 */
export interface PreferenceGate {
  isAllowed(context: ChannelGateContext): boolean | Promise<boolean>;
  /**
   * Optional richer decision used for quiet hours / deferral. When omitted the runner uses
   * {@link isAllowed} (`true` → allow, `false` → skip).
   */
  evaluate?(context: ChannelGateContext): GateDecision | Promise<GateDecision>;
}

/** Behaviour when a single channel throws. */
export type ErrorPolicy = 'continueOnError' | 'failFast';
