import type { Notifiable, NotificationInput, SendResult } from './interfaces';
import type { NotificationService, SendScope } from './notification.service';

/**
 * A notifiable with no backing entity — it simply routes one or more channels to literal
 * values. Created via {@link NotificationService.route}.
 */
export class AnonymousNotifiable implements Notifiable {
  private readonly routes = new Map<string, unknown>();

  route(channel: string, value: unknown): this {
    this.routes.set(channel, value);
    return this;
  }

  routeNotificationFor(channel: string): unknown {
    return this.routes.get(channel);
  }
}

/**
 * Fluent builder returned by {@link NotificationService.route}. Lets you chain extra
 * routes before sending an on-demand notification.
 *
 * ```ts
 * await notifications.route('mail', 'a@b.com').route('slack', url).notify(new Welcome());
 * ```
 */
export class PendingNotification {
  private readonly notifiable = new AnonymousNotifiable();

  constructor(
    private readonly service: NotificationService,
    channel: string,
    routeValue: unknown,
    private readonly scope: SendScope = {},
  ) {
    this.notifiable.route(channel, routeValue);
  }

  route(channel: string, routeValue: unknown): this {
    this.notifiable.route(channel, routeValue);
    return this;
  }

  notify(notification: NotificationInput): Promise<SendResult[]> {
    return this.service.sendScoped(this.notifiable, notification, this.scope);
  }
}
