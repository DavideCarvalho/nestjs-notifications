import type { Notifiable, Notification } from './interfaces';

/** Emitted before a channel attempts delivery (`notification.sending`). */
export class NotificationSendingEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
    /** Tenant the delivery is scoped to, when multi-tenant. */
    public readonly tenant?: string,
  ) {}
}

/** Emitted after a channel delivers successfully (`notification.sent`). */
export class NotificationSentEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
    /** Tenant the delivery was scoped to, when multi-tenant. */
    public readonly tenant?: string,
    /** Wall-clock time the channel's `send()` took, in milliseconds. */
    public readonly durationMs?: number,
    /** Whatever the channel driver returned (e.g. a provider message id). */
    public readonly response?: unknown,
  ) {}
}

/** Emitted when a channel throws (`notification.failed`). */
export class NotificationFailedEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
    public readonly error: unknown,
    /** Tenant the delivery was scoped to, when multi-tenant. */
    public readonly tenant?: string,
    /** Wall-clock time before the failure, in milliseconds. */
    public readonly durationMs?: number,
  ) {}
}
