import {
  type Notifiable,
  type Notification,
  NotificationEvents,
  type NotificationFailedEvent,
  type NotificationSentEvent,
  notificationName,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DeliveryStatus, DeliveryTrackingStore } from './interfaces';
import { DELIVERY_TRACKING_STORE } from './tokens';

/**
 * Subscribes to the core `notification.sent` / `notification.failed` events (emitted through
 * `@nestjs/event-emitter`) and persists a {@link import('./interfaces').DeliveryRecord} for each
 * channel delivery — no monkey-patching of the notification pipeline. Mirrors the defensive
 * `resolveEmitter` + try/catch style of the telescope watcher.
 *
 * Requires `EventEmitterModule.forRoot()` in the host app.
 */
@Injectable()
export class DeliveryTrackingListener implements OnModuleInit {
  private readonly logger = new Logger(DeliveryTrackingListener.name);
  private registered = false;

  constructor(
    @Inject(DELIVERY_TRACKING_STORE)
    private readonly store: DeliveryTrackingStore,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    if (this.registered) return;

    const emitter = this.resolveEmitter();
    if (!emitter) {
      this.logger.warn(
        'DeliveryTrackingListener: EventEmitter2 not found. Did you import EventEmitterModule.forRoot()?',
      );
      return;
    }
    this.registered = true;

    emitter.on(NotificationEvents.sent, (event: NotificationSentEvent) =>
      this.safeRecord(event, 'sent'),
    );
    emitter.on(NotificationEvents.failed, (event: NotificationFailedEvent) =>
      this.safeRecord(event, 'failed'),
    );
  }

  private resolveEmitter(): EventEmitter2 | null {
    try {
      return this.moduleRef.get(EventEmitter2, { strict: false });
    } catch {
      return null;
    }
  }

  private safeRecord(
    event: NotificationSentEvent | NotificationFailedEvent,
    status: Extract<DeliveryStatus, 'sent' | 'failed'>,
  ): void {
    void this.record(event, status);
  }

  private async record(
    event: NotificationSentEvent | NotificationFailedEvent,
    status: Extract<DeliveryStatus, 'sent' | 'failed'>,
  ): Promise<void> {
    try {
      const ref = notifiableRef(event.notifiable);
      const providerMessageId =
        status === 'sent' ? providerIdFrom((event as NotificationSentEvent).response) : null;
      await this.store.record({
        channel: event.channel,
        notificationType: notificationName(event.notification),
        notifiableType: ref.type,
        notifiableId: ref.id,
        tenantId: event.tenant ?? null,
        providerMessageId,
        status,
        error: status === 'failed' ? describe((event as NotificationFailedEvent).error) : null,
      });
    } catch (error) {
      this.logger.error(`DeliveryTrackingListener: failed to record delivery: ${describe(error)}`);
    }
  }
}

/**
 * Best-effort extraction of a provider message id from whatever a channel driver returned, so
 * inbound provider webhooks can later correlate a delivery/bounce back to this record. Handles a
 * bare id string and the common id field names across providers.
 */
function providerIdFrom(response: unknown): string | null {
  if (typeof response === 'string') return response || null;
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    for (const key of ['providerMessageId', 'messageId', 'MessageSid', 'sid', 'id']) {
      const value = obj[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return null;
}

function notifiableRef(notifiable: Notifiable): {
  type: string | null;
  id: string | null;
} {
  try {
    if (typeof notifiable.toNotifiableRef === 'function') {
      const ref = notifiable.toNotifiableRef();
      return { type: ref.type, id: String(ref.id) };
    }
    return { type: notifiable.constructor?.name ?? null, id: null };
  } catch {
    return { type: null, id: null };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
