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
  toTeams(notifiable: Notifiable): TeamsMessage | Record<string, unknown>;
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/**
 * Delivers a notification to Microsoft Teams via an incoming webhook. The route from
 * `routeNotificationFor('teams')` may be a webhook URL; otherwise the configured
 * `webhookUrl` is used.
 */
@Injectable()
export class TeamsChannel implements ChannelDriver {
  readonly channel = 'teams';

  constructor(
    @Inject(TEAMS_OPTIONS)
    private readonly options: TeamsChannelOptions,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    _context?: DeliveryContext,
  ): Promise<void> {
    const handler = getHandler(notification, 'teams', 'toTeams');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('teams', 'toTeams()', name);
    }

    const result = handler(notifiable) as TeamsMessage | Record<string, unknown>;
    const payload = result instanceof TeamsMessage ? result.toPayload() : result;
    const route = routeFor(notifiable, 'teams', notification);

    const webhookUrl = isHttpsUrl(route) ? route : this.options.webhookUrl;
    if (!webhookUrl) {
      throw new Error(
        'The teams channel needs a webhook URL. Return one from ' +
          'routeNotificationFor("teams"), or set webhookUrl in forRoot().',
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
      throw new Error(`Teams request to ${url} failed with status ${response.status}.`);
    }
  }
}
