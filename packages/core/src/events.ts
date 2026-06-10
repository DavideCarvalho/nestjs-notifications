import type { Notifiable, Notification } from './interfaces';

/** Emitted before a channel attempts delivery (`notification.sending`). */
export class NotificationSendingEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
  ) {}
}

/** Emitted after a channel delivers successfully (`notification.sent`). */
export class NotificationSentEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
  ) {}
}

/** Emitted when a channel throws (`notification.failed`). */
export class NotificationFailedEvent {
  constructor(
    public readonly notifiable: Notifiable,
    public readonly notification: Notification,
    public readonly channel: string,
    public readonly error: unknown,
  ) {}
}
