import type { PushMessage } from './push-message';

/**
 * The "address" a push notification is delivered to, as returned by
 * `routeNotificationFor('push')`. The concrete shape depends on the transport
 * (a Web Push subscription object, an FCM device token, an Expo push token, ...),
 * so it is intentionally left `unknown` for each transport to interpret.
 */
export type PushTarget = unknown;

/**
 * Delivers a single push notification. Swap implementations for different
 * providers ({@link WebPushTransport}, {@link FcmTransport}, {@link ExpoTransport}).
 */
export interface PushTransport {
  /**
   * Deliver `message` to a single `target`. The channel calls this once per
   * target when `routeNotificationFor('push')` returns an array.
   */
  send(target: unknown, message: PushMessage): Promise<void>;
}
