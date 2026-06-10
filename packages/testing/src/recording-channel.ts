import type { ChannelDriver, Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';

/** A single delivery captured by {@link RecordingChannel}. */
export interface RecordedDelivery {
  notifiable: Notifiable;
  notification: Notification;
}

/**
 * A {@link ChannelDriver} test double that records deliveries instead of sending them.
 * Useful for integration tests that exercise the real `NotificationService`, registry,
 * and runner end-to-end while capturing what reached the channel.
 *
 * ```ts
 * const channel = new RecordingChannel('mail');
 * // register `channel` with the ChannelRegistry, then assert on `channel.sent`.
 * ```
 */
export class RecordingChannel implements ChannelDriver {
  readonly channel: string;

  /** Everything delivered to this channel, in order. */
  readonly sent: RecordedDelivery[] = [];

  constructor(channel = 'test') {
    this.channel = channel;
  }

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    this.sent.push({ notifiable, notification });
  }

  /** Clears recorded deliveries. */
  reset(): void {
    this.sent.length = 0;
  }
}
