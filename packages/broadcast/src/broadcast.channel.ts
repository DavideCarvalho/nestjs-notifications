import type { ChannelDriver, Notifiable, Notification } from '@nestjs-notifications/core';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationsGateway } from './gateway';
import { BROADCAST_OPTIONS } from './tokens';

/** Resolved runtime options for the broadcast channel. */
export interface BroadcastChannelOptions {
  /** Event name emitted to clients. Defaults to `'notification'`. */
  event?: string;
}

/** Implement this on a notification to define its real-time payload. */
export interface BroadcastNotification extends Notification {
  toBroadcast?(notifiable: Notifiable): Record<string, unknown>;
  toArray?(notifiable: Notifiable): Record<string, unknown>;
}

/**
 * Pushes a notification to the notifiable's websocket room via
 * {@link NotificationsGateway}. Reads the payload from `toBroadcast()`, then
 * `toArray()`, then a structural copy of the notification.
 */
@Injectable()
export class BroadcastChannel implements ChannelDriver {
  readonly channel = 'broadcast';

  constructor(
    private readonly gateway: NotificationsGateway,
    @Inject(BROADCAST_OPTIONS)
    private readonly options: BroadcastChannelOptions,
  ) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const room = String(notifiable.routeNotificationFor('broadcast', notification));
    const event = this.options.event ?? 'notification';
    const payload = this.payloadFor(notifiable, notification as BroadcastNotification);

    this.gateway.emitToRoom(room, event, payload);
  }

  private payloadFor(
    notifiable: Notifiable,
    notification: BroadcastNotification,
  ): Record<string, unknown> {
    if (typeof notification.toBroadcast === 'function') return notification.toBroadcast(notifiable);
    if (typeof notification.toArray === 'function') return notification.toArray(notifiable);
    const { ...rest } = notification as unknown as Record<string, unknown>;
    return rest;
  }
}
