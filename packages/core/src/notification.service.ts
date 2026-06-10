import { Inject, Injectable } from '@nestjs/common';
import { ChannelRunner } from './channel-runner';
import { resolveChannels } from './decorators';
import type {
  DispatchDriver,
  Notifiable,
  NotifiableInput,
  Notification,
  NotificationInput,
  SendResult,
} from './interfaces';
import { PendingNotification } from './pending-notification';
import { NOTIFICATION_DISPATCHER } from './tokens';

/**
 * Public API for sending notifications. Mirrors Laravel's `Notification` facade:
 *
 * ```ts
 * const [result] = await notifications.send(user, new InvoicePaid(invoice));
 * result.results; // [{ channel: 'mail', status: 'sent', response }, ...]
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
   * Send a notification to one or many notifiables, returning a per-notifiable, per-channel
   * {@link SendResult}. Goes through the async dispatcher when the notification sets
   * `shouldQueue` or a `delay`; otherwise it delivers inline.
   */
  async send(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    const isAsync = n.shouldQueue || n.delay !== undefined;
    return Promise.all(
      targets.map((notifiable) =>
        isAsync
          ? this.sendAsyncTo(notifiable as Notifiable, n)
          : this.sendNowTo(notifiable as Notifiable, n),
      ),
    );
  }

  /** Alias of {@link send}, matching Laravel's `notify()` ergonomics. */
  notify(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    return this.send(notifiables, notification);
  }

  /** Force inline delivery, ignoring `shouldQueue`/`delay` (Laravel's `sendNow`). */
  async sendNow(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    return Promise.all(targets.map((target) => this.sendNowTo(target as Notifiable, n)));
  }

  /** Force delivery through the configured async dispatcher. */
  async sendAsync(
    notifiables: NotifiableInput | NotifiableInput[],
    notification: NotificationInput,
  ): Promise<SendResult[]> {
    const n = notification as Notification;
    const targets = Array.isArray(notifiables) ? notifiables : [notifiables];
    return Promise.all(targets.map((target) => this.sendAsyncTo(target as Notifiable, n)));
  }

  /** Start an on-demand notification to a raw route value, with no Notifiable object. */
  route(channel: string, routeValue: unknown): PendingNotification {
    return new PendingNotification(this, channel, routeValue);
  }

  private async sendNowTo(notifiable: Notifiable, notification: Notification): Promise<SendResult> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return { notifiable, results: [] };
    const results = await this.runner.run(notifiable, notification, channels);
    return { notifiable, results };
  }

  private async sendAsyncTo(
    notifiable: Notifiable,
    notification: Notification,
  ): Promise<SendResult> {
    const channels = resolveChannels(notification, notifiable);
    if (channels.length === 0) return { notifiable, results: [] };
    // Pass live objects through; cross-process dispatchers serialize via NotificationSerializer.
    await this.dispatcher.dispatch({
      notifiable,
      notification,
      channels,
      queue: notification.queue,
      delay: toDelayMs(notification.delay),
    });
    return {
      notifiable,
      results: channels.map((channel) => ({ channel, status: 'queued' as const })),
    };
  }
}

/** Normalize a delay (ms number or absolute Date) to milliseconds from now. */
function toDelayMs(delay: number | Date | undefined): number | undefined {
  if (delay === undefined) return undefined;
  if (delay instanceof Date) return Math.max(0, delay.getTime() - Date.now());
  return Math.max(0, delay);
}
