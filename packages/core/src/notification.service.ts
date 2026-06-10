import { Inject, Injectable } from '@nestjs/common';
import { ChannelRunner } from './channel-runner';
import { resolveChannels } from './decorators';
import type { DispatchDriver, Notifiable, Notification, NotificationInput } from './interfaces';
import { PendingNotification } from './pending-notification';
import { NOTIFICATION_DISPATCHER } from './tokens';

/**
 * Public API for sending notifications. Mirrors Laravel's `Notification` facade:
 *
 * ```ts
 * await notifications.send(user, new InvoicePaid(invoice));
 * await notifications.route('mail', 'a@b.com').notify(new InvoicePaid(invoice));
 * ```
 */
@Injectable()
export class NotificationService {
  constructor(
    private readonly runner: ChannelRunner,
    @Inject(NOTIFICATION_DISPATCHER)
    private readonly dispatcher: DispatchDriver,
  ) {}

  /**
   * Send a notification to one or many notifiables. Goes through the async dispatcher when
   * the notification sets `shouldQueue`, otherwise delivers inline.
   */
  async send(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<void> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    await Promise.all(
      targets.map((notifiable) =>
        n.shouldQueue ? this.sendAsyncTo(notifiable, n) : this.sendNowTo(notifiable, n),
      ),
    );
  }

  /** Alias of {@link send}, matching Laravel's `notify()` ergonomics. */
  notify(notifiables: Notifiable | Notifiable[], notification: NotificationInput): Promise<void> {
    return this.send(notifiables, notification);
  }

  /** Force inline delivery, ignoring `shouldQueue` (Laravel's `sendNow`). */
  async sendNow(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<void> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    await Promise.all(targets.map((target) => this.sendNowTo(target, n)));
  }

  /** Force delivery through the configured async dispatcher. */
  async sendAsync(
    notifiables: Notifiable | Notifiable[],
    notification: NotificationInput,
  ): Promise<void> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    await Promise.all(targets.map((target) => this.sendAsyncTo(target, n)));
  }

  /** Start an on-demand notification to a raw route value, with no Notifiable object. */
  route(channel: string, routeValue: unknown): PendingNotification {
    return new PendingNotification(this, channel, routeValue);
  }

  private async sendNowTo(notifiable: Notifiable, notification: Notification): Promise<void> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return;
    await this.runner.run(notifiable, notification, channels);
  }

  private async sendAsyncTo(notifiable: Notifiable, notification: Notification): Promise<void> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return;
    // Pass live objects through; cross-process dispatchers serialize via NotificationSerializer.
    await this.dispatcher.dispatch({
      notifiable,
      notification,
      channels,
      queue: notification.queue,
    });
  }
}
