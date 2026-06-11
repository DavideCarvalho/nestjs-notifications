import {
  type ChannelDriver,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import { sseKey } from './sse-key';
import { SseHub } from './sse.hub';
import { SSE_OPTIONS } from './tokens';

/** Channel handle: use as `@Sse()` on a payload method, or as a token in `via()`. */
export const Sse = createChannel('sse');

/** Resolved runtime options for the SSE channel. */
export interface SseChannelOptions {
  /** SSE event name (`type`) emitted to clients. Defaults to `'notification'`. */
  event?: string;
}

/** Implement this on a notification to define its SSE payload. */
export interface SseNotification extends Notification {
  toSse?(notifiable: Notifiable): Record<string, unknown>;
  toArray?(notifiable: Notifiable): Record<string, unknown>;
}

/**
 * Pushes a notification to the notifiable's Server-Sent Events stream via
 * {@link SseHub}, using NestJS's native `@Sse()` support. Reads the payload from
 * `toSse()`, then `toArray()`, then a structural copy of the notification.
 *
 * The endpoint is mounted by the consumer, not this package. Subscribe to the
 * same key the channel publishes to with {@link sseKey}:
 *
 * ```ts
 * import { Sse, type MessageEvent } from '@nestjs/common';
 * import { SseHub, sseKey } from '@dudousxd/nestjs-notifications-sse';
 *
 * @Controller('notifications')
 * class NotificationsController {
 *   constructor(private readonly hub: SseHub) {}
 *
 *   @Sse('stream')
 *   stream(@Req() req): Observable<MessageEvent> {
 *     // build the SAME key the notifiable routes to (tenant-aware)
 *     return this.hub.stream(sseKey(req.tenantId, String(req.user.id)));
 *   }
 * }
 * ```
 */
@Injectable()
export class SseChannel implements ChannelDriver {
  readonly channel = 'sse';

  constructor(
    private readonly hub: SseHub,
    @Inject(SSE_OPTIONS)
    private readonly options: SseChannelOptions,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const routeValue = String(routeFor(notifiable, 'sse', notification));
    const key = sseKey(context?.tenant, routeValue);
    const event = this.options.event ?? 'notification';
    const payload = this.payloadFor(notifiable, notification as SseNotification);

    this.hub.publish(key, payload, { event });
  }

  private payloadFor(
    notifiable: Notifiable,
    notification: SseNotification,
  ): Record<string, unknown> {
    const handler = getHandler(notification, 'sse', 'toSse');
    if (handler) return handler(notifiable) as Record<string, unknown>;
    if (typeof notification.toArray === 'function') return notification.toArray(notifiable);
    const { ...rest } = notification as unknown as Record<string, unknown>;
    return rest;
  }
}
