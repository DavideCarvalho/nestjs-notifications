import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChannelRegistry } from './channel-registry';
import { injectServices } from './decorators';
import { ChannelNotRegisteredError } from './errors';
import { NotificationFailedEvent, NotificationSendingEvent, NotificationSentEvent } from './events';
import type { ChannelResult, Notifiable, Notification } from './interfaces';
import type { NotificationsModuleOptions } from './options';
import { NOTIFICATION_OPTIONS, NotificationEvents } from './tokens';

/**
 * Runs a notification across its channels and emits lifecycle events. This is the shared
 * delivery engine: the synchronous dispatcher calls it inline, and async workers call it
 * after rehydrating the job.
 *
 * Error policy:
 * - `failFast`: deliver sequentially and rethrow on the first channel failure.
 * - `continueOnError` (default): deliver to every channel; failures are logged and
 *   surfaced through the `notification.failed` event rather than thrown.
 */
@Injectable()
export class ChannelRunner {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly registry: ChannelRegistry,
    private readonly events: EventEmitter2,
    private readonly moduleRef: ModuleRef,
    @Inject(NOTIFICATION_OPTIONS)
    private readonly options: NotificationsModuleOptions,
  ) {}

  async run(
    notifiable: Notifiable,
    notification: Notification,
    channels: string[],
  ): Promise<ChannelResult[]> {
    // Populate @InjectService properties from the container (no-op if there are none).
    injectServices(notification, this.moduleRef);

    const failFast = this.options.errorPolicy === 'failFast';

    if (failFast) {
      const results: ChannelResult[] = [];
      for (const channel of channels) {
        results.push(await this.deliver(notifiable, notification, channel, true));
      }
      return results;
    }

    const settled = await Promise.allSettled(
      channels.map((channel) => this.deliver(notifiable, notification, channel, false)),
    );
    return settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { channel: channels[i] ?? 'unknown', status: 'failed' as const, error: s.reason },
    );
  }

  private async deliver(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    rethrow: boolean,
  ): Promise<ChannelResult> {
    // shouldSend gate (Laravel parity): skip this channel when it returns false.
    if (
      typeof notification.shouldSend === 'function' &&
      !notification.shouldSend(notifiable, channel)
    ) {
      return { channel, status: 'skipped' };
    }

    const driver = this.registry.get(channel);
    if (!driver) {
      const err = new ChannelNotRegisteredError(channel, this.registry.names());
      this.emitFailed(notifiable, notification, channel, err);
      if (rethrow) throw err;
      this.logger.error(err.message);
      return { channel, status: 'failed', error: err };
    }

    this.events.emit(
      NotificationEvents.sending,
      new NotificationSendingEvent(notifiable, notification, channel),
    );

    try {
      const response = await driver.send(notifiable, notification);
      this.events.emit(
        NotificationEvents.sent,
        new NotificationSentEvent(notifiable, notification, channel),
      );
      if (typeof notification.afterSending === 'function') {
        await notification.afterSending(notifiable, channel, response);
      }
      return { channel, status: 'sent', response };
    } catch (error) {
      this.emitFailed(notifiable, notification, channel, error);
      this.logger.error(`Channel "${channel}" failed: ${describe(error)}`);
      if (rethrow) throw error;
      return { channel, status: 'failed', error };
    }
  }

  private emitFailed(
    notifiable: Notifiable,
    notification: Notification,
    channel: string,
    error: unknown,
  ): void {
    this.events.emit(
      NotificationEvents.failed,
      new NotificationFailedEvent(notifiable, notification, channel, error),
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
