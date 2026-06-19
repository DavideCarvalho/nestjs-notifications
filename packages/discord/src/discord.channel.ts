import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  postJson,
  resolveWebhookUrl,
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
  toDiscord(ctx: ChannelContext): DiscordMessage;
}

/**
 * Delivers a notification to Discord via an incoming webhook. The route from
 * `routeNotificationFor('discord')` may be a webhook URL; otherwise the configured
 * `webhookUrl` is used.
 */
@Injectable()
export class DiscordChannel extends BaseChannel {
  readonly channel = 'discord';

  constructor(
    @Inject(DISCORD_OPTIONS)
    private readonly options: DiscordChannelOptions,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const message = this.buildPayload<DiscordMessage>(
      notification,
      notifiable,
      'toDiscord',
      context,
    );
    const route = routeFor(notifiable, 'discord', notification);
    const webhookUrl = resolveWebhookUrl(route, this.options.webhookUrl, 'discord');
    await postJson(webhookUrl, message.toPayload(), { label: 'Discord' });
  }
}
