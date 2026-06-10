import {
  type Notifiable,
  type Notification,
  NotificationEvents,
  type NotificationFailedEvent,
  type NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';
// Type-only imports — erased at compile time, so this CJS package never has to
// `require()` the ESM-only telescope package at runtime.
import type { RecordInput, Watcher, WatcherContext } from '@dudousxd/nestjs-telescope';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/** Telescope entry `type` produced by this watcher. */
export const NOTIFICATION_ENTRY_TYPE = 'notification';

export interface NotificationsWatcherOptions {
  /** Include a structural snapshot of the notification as the entry payload. Default true. */
  recordPayload?: boolean;
}

/** What a single recorded notification entry looks like in the Telescope dashboard. */
export interface NotificationEntryContent {
  channel: string;
  notifiable: string | null;
  notificationClass: string;
  status: 'sent' | 'failed';
  payload: Record<string, unknown> | null;
  failureReason: string | null;
}

/**
 * A nestjs-telescope watcher that records every notification delivery. It listens to the
 * `notification.sent` / `notification.failed` events the core already emits through
 * `@nestjs/event-emitter` — no monkey-patching of the notification pipeline.
 *
 * ```ts
 * TelescopeModule.forRoot({ watchers: [new NotificationsWatcher()] });
 * ```
 *
 * Requires `EventEmitterModule.forRoot()` and `NotificationsModule.forRoot(...)` in the app.
 */
export class NotificationsWatcher implements Watcher {
  readonly type = NOTIFICATION_ENTRY_TYPE;
  private readonly logger = new Logger(NotificationsWatcher.name);
  private readonly recordPayload: boolean;
  private registered = false;

  constructor(options: NotificationsWatcherOptions = {}) {
    this.recordPayload = options.recordPayload ?? true;
  }

  register(ctx: WatcherContext): void {
    if (this.registered) return;
    this.registered = true;

    const emitter = this.resolveEmitter(ctx);
    if (!emitter) {
      this.logger.warn(
        'NotificationsWatcher: EventEmitter2 not found. Did you import EventEmitterModule.forRoot()?',
      );
      return;
    }

    emitter.on(NotificationEvents.sent, (event: NotificationSentEvent) =>
      this.safeRecord(ctx, event, 'sent'),
    );
    emitter.on(NotificationEvents.failed, (event: NotificationFailedEvent) =>
      this.safeRecord(ctx, event, 'failed'),
    );
  }

  private resolveEmitter(ctx: WatcherContext): EventEmitter2 | null {
    try {
      return ctx.moduleRef.get(EventEmitter2, { strict: false });
    } catch {
      return null;
    }
  }

  private safeRecord(
    ctx: WatcherContext,
    event: NotificationSentEvent | NotificationFailedEvent,
    status: 'sent' | 'failed',
  ): void {
    try {
      const notificationClass = nameOf(event.notification);
      const content: NotificationEntryContent = {
        channel: event.channel,
        notifiable: labelNotifiable(event.notifiable),
        notificationClass,
        status,
        payload: this.recordPayload ? snapshot(event.notification) : null,
        failureReason:
          status === 'failed' ? describe((event as NotificationFailedEvent).error) : null,
      };

      const input: RecordInput = {
        type: this.type,
        familyHash: `${event.channel}:${notificationClass}`,
        tags: [
          `channel:${event.channel}`,
          `notification:${notificationClass}`,
          ...(status === 'failed' ? ['failed'] : []),
        ],
        content,
      };
      ctx.record(input);
    } catch (error) {
      this.logger.error(`NotificationsWatcher: failed to record entry: ${describe(error)}`);
    }
  }
}

function nameOf(notification: Notification): string {
  const ctor = notification.constructor as { notificationName?: string; name: string };
  return ctor.notificationName ?? ctor.name;
}

function labelNotifiable(notifiable: Notifiable): string | null {
  try {
    if (typeof notifiable.toNotifiableRef === 'function') {
      const ref = notifiable.toNotifiableRef();
      return `${ref.type}#${ref.id}`;
    }
    return notifiable.constructor?.name ?? null;
  } catch {
    return null;
  }
}

/** A JSON-safe structural copy of the notification's own data (functions stripped). */
function snapshot(notification: Notification): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(notification as unknown as Record<string, unknown>)) {
    if (typeof value !== 'function') out[key] = value;
  }
  return out;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
