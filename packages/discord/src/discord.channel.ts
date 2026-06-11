import {
  type ChannelDriver,
  type DeliveryContext,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { DiscordMessage } from './discord-message';
import { DISCORD_OPTIONS } from './tokens';

/** Channel handle: use as `@Discord()` on a payload method, or as a token in `via()`. */
export const Discord = createChannel('discord');

/** Resolved runtime options for the discord channel. */
export interface DiscordChannelOptions {
  /** Default incoming-webhook URL used when the route doesn't supply one. */
  webhookUrl?: string;
}

/** Implement this on a notification to define its Discord payload. */
export interface DiscordNotification extends Notification {
  toDiscord(notifiable: Notifiable): DiscordMessage;
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/**
 * Delivers a notification to Discord via an incoming webhook. The route from
 * `routeNotificationFor('discord')` may be a webhook URL; otherwise the configured
 * `webhookUrl` is used.
 */
@Injectable()
export class DiscordChannel implements ChannelDriver {
  readonly channel = 'discord';

  constructor(
    @Inject(DISCORD_OPTIONS)
    private readonly options: DiscordChannelOptions,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    _context?: DeliveryContext,
  ): Promise<void> {
    const handler = getHandler(notification, 'discord', 'toDiscord');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('discord', 'toDiscord()', name);
    }

    const message = handler(notifiable) as DiscordMessage;
    const payload = message.toPayload();
    const route = routeFor(notifiable, 'discord', notification);

    const webhookUrl = isHttpsUrl(route) ? route : this.options.webhookUrl;
    if (!webhookUrl) {
      throw new Error(
        'The discord channel needs a webhook URL. Return one from ' +
          'routeNotificationFor("discord"), or set webhookUrl in forRoot().',
      );
    }

    await this.post(webhookUrl, payload);
  }

  private async post(url: string, body: object): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Discord request to ${url} failed with status ${response.status}.`);
    }
  }
}
