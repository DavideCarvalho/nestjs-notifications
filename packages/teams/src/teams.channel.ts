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
import { TeamsMessage } from './teams-message';
import { TEAMS_OPTIONS } from './tokens';

/** Channel handle: use as `@Teams()` on a payload method, or as a token in `via()`. */
export const Teams = createChannel('teams');

/** Resolved runtime options for the teams channel. */
export interface TeamsChannelOptions {
  /** Default incoming-webhook URL used when the route doesn't supply one. */
  webhookUrl?: string;
}

/**
 * Implement this on a notification to define its Teams payload. Returning a plain object
 * is posted verbatim (e.g. a hand-built MessageCard or Adaptive Card); return a
 * {@link TeamsMessage} for the fluent builder.
 */
export interface TeamsNotification extends Notification {
  toTeams(ctx: ChannelContext): TeamsMessage | Record<string, unknown>;
}

/**
 * Delivers a notification to Microsoft Teams via an incoming webhook. The route from
 * `routeNotificationFor('teams')` may be a webhook URL; otherwise the configured
 * `webhookUrl` is used.
 */
@Injectable()
export class TeamsChannel extends BaseChannel {
  readonly channel = 'teams';

  constructor(
    @Inject(TEAMS_OPTIONS)
    private readonly options: TeamsChannelOptions,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const result = this.buildPayload<TeamsMessage | Record<string, unknown>>(
      notification,
      notifiable,
      'toTeams',
      context,
    );
    const payload = result instanceof TeamsMessage ? result.toPayload() : result;
    const route = routeFor(notifiable, 'teams', notification);
    const webhookUrl = resolveWebhookUrl(route, this.options.webhookUrl, 'teams');
    await postJson(webhookUrl, payload, { label: 'Teams' });
  }
}
