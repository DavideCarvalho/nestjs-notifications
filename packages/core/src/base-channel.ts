import { getHandler } from './decorators';
import { MissingChannelMethodError } from './errors';
import type { ChannelDriver, DeliveryContext, Notifiable, Notification } from './interfaces';

/**
 * The name used for display/persistence surfaces (errors, channel logging, diagnostics):
 * the instance's `notificationType()` override when implemented, else the explicit static
 * `notificationName`, else the class name.
 *
 * Deliberately NOT used by the serializer's rehydration registry — that key must stay
 * class-level so a generic class with an instance-level `notificationType()` can still be
 * looked up by its class name on deserialize. See `serializer.ts`.
 */
export function notificationName(notification: Notification): string {
  return (
    notification.notificationType?.() ??
    (notification.constructor as { notificationName?: string }).notificationName ??
    notification.constructor.name
  );
}

/**
 * Base class for {@link ChannelDriver} implementations. Owns the delivery preamble every channel
 * repeats by hand — resolving the notification's payload method (and the uniform
 * {@link MissingChannelMethodError} when it is missing), building the handler context, and the
 * per-tenant transport/options swap — so an adapter only implements the transport-specific tail of
 * `send()`.
 */
export abstract class BaseChannel implements ChannelDriver {
  abstract readonly channel: string;

  abstract send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<unknown>;

  /**
   * Invoke the notification's payload builder for this channel — the `@<Channel>()`-decorated method
   * if present, else the `fallback` convention name (e.g. `toMail`) — and return its result. Throws
   * {@link MissingChannelMethodError} when the notification implements neither.
   */
  protected buildPayload<T>(
    notification: Notification,
    notifiable: Notifiable,
    fallback: string,
    context: DeliveryContext | undefined,
  ): T {
    const handler = getHandler(notification, this.channel, fallback);
    if (!handler) {
      throw new MissingChannelMethodError(
        this.channel,
        `${fallback}()`,
        notificationName(notification),
      );
    }
    return handler({
      notifiable,
      localization: context?.localization,
      tenant: context?.tenant,
    }) as T;
  }

  /** Pick the per-tenant value when both a tenant and a resolver are present, else `fallback`. */
  protected forTenant<T>(
    fallback: T,
    context: DeliveryContext | undefined,
    resolver?: (tenant: string) => T,
  ): T {
    return context?.tenant && resolver ? resolver(context.tenant) : fallback;
  }
}
