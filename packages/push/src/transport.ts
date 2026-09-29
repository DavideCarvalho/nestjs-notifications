import type { PushMessage } from './push-message';

/**
 * The "address" a push notification is delivered to, as returned by
 * `routeNotificationFor('push')`. The concrete shape depends on the transport
 * (a Web Push subscription object, an FCM device token, an Expo push token, ...),
 * so it is intentionally left `unknown` for each transport to interpret.
 */
export type PushTarget = unknown;

/**
 * The set of targets a multicast/batch send rejected as permanently invalid (e.g. an FCM token
 * that returned `UNREGISTERED`, or an Expo token that returned `DeviceNotRegistered`). The app
 * should prune these from its store so it stops sending to dead devices.
 */
export interface BatchSendResult {
  /** Targets the provider reported as unregistered/invalid — safe to delete. */
  invalidTargets: unknown[];
  /**
   * Optional: targets that failed for another (possibly transient) reason — a rate limit, a 5xx
   * from the provider, a network error. Not pruned; surfaced in the {@link PushDeliveryResult} so
   * the failure isn't silently swallowed. When EVERY target failed this way the channel throws.
   */
  failures?: PushTargetFailure[];
}

/** One target a push delivery could not reach (for a reason other than an invalid token). */
export interface PushTargetFailure {
  target: unknown;
  error: unknown;
}

/**
 * What `PushChannel.send()` resolves to — surfaced as the push `ChannelResult.response` in the
 * `SendResult`, passed to `afterSending(notifiable, 'push', response)` and carried on the
 * `notification.sent` event.
 */
export interface PushDeliveryResult {
  /** How many targets the route resolved to (0 when the route returned an empty array). */
  targets: number;
  /** How many targets were delivered to (targets minus invalid minus failures). */
  delivered: number;
  /** Targets the transport reported as permanently invalid (also passed to `onInvalidTokens`). */
  invalidTargets: unknown[];
  /** Targets that failed for another reason, with the error. Empty on full success. */
  failures: PushTargetFailure[];
}

/** Thrown by `PushChannel.send()` when no target could be delivered to. */
export class PushDeliveryError extends Error {
  constructor(
    message: string,
    /** The per-target failures (each with its original error). */
    readonly failures: PushTargetFailure[],
    /** Targets the provider rejected as invalid, if any. */
    readonly invalidTargets: unknown[] = [],
  ) {
    super(message);
    this.name = 'PushDeliveryError';
  }
}

/**
 * Delivers a single push notification. Swap implementations for different
 * providers ({@link WebPushTransport}, {@link FcmTransport}, {@link ExpoTransport}).
 *
 * Transports that support multicast (FCM, Expo) additionally implement {@link sendMany}; the
 * {@link PushChannel} prefers it for arrays of targets so a fan-out is a single API round-trip
 * and invalid tokens can be reported back for pruning.
 */
export interface PushTransport {
  /**
   * Deliver `message` to a single `target`. The channel calls this once per
   * target when `routeNotificationFor('push')` returns an array AND the transport
   * does not implement {@link sendMany}.
   */
  send(target: unknown, message: PushMessage): Promise<void>;
  /**
   * Optional batch/multicast delivery to many targets in one round-trip. Returns the set of
   * targets the provider rejected as permanently invalid so callers can prune them. Transports
   * without native batching omit this and the channel falls back to per-target {@link send}.
   */
  sendMany?(targets: unknown[], message: PushMessage): Promise<BatchSendResult>;
}

/**
 * Invoked with the targets a provider reported as permanently invalid after a (batch) send, so
 * the application can prune them from its token store. Receives the notifiable and tenant for
 * context. Errors thrown here are swallowed so pruning can't break delivery.
 */
export type InvalidTokenCallback = (report: InvalidTokenReport) => void | Promise<void>;

/** The argument handed to an {@link InvalidTokenCallback}. */
export interface InvalidTokenReport {
  /** The notifiable whose tokens were rejected. */
  notifiable: unknown;
  /** The targets (tokens) the provider rejected as permanently invalid. */
  invalidTargets: unknown[];
  /** Tenant scope of the delivery, when multi-tenant. */
  tenant?: string | undefined;
}
