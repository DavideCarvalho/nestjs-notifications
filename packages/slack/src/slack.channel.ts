import {
  type ChannelDriver,
  MissingChannelMethodError,
  type Notifiable,
  type Notification,
  createChannel,
  getHandler,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { SlackMessage, SlackPayload } from './slack-message';
import { SLACK_OPTIONS } from './tokens';

/** Channel handle: use as `@Slack()` on a payload method, or as a token in `via()`. */
export const Slack = createChannel('slack');

const CHAT_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

/** Resolved runtime options for the slack channel. */
export interface SlackChannelOptions {
  /** Default incoming-webhook URL used when the route doesn't supply one. */
  webhookUrl?: string;
  /** Bot/user token for the Web API (`chat.postMessage`). */
  token?: string;
  /** Default channel id used with the Web API when the route isn't a webhook. */
  defaultChannel?: string;
}

/** Implement this on a notification to define its Slack payload. */
export interface SlackNotification extends Notification {
  toSlack(notifiable: Notifiable): SlackMessage;
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/**
 * Delivers a notification to Slack via an incoming webhook, or the Web API
 * (`chat.postMessage`) when a bot token is configured. The route from
 * `routeNotificationFor('slack')` may be a webhook URL or a channel id.
 */
@Injectable()
export class SlackChannel implements ChannelDriver {
  readonly channel = 'slack';

  constructor(
    @Inject(SLACK_OPTIONS)
    private readonly options: SlackChannelOptions,
  ) {}

  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    const handler = getHandler(notification, 'slack', 'toSlack');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('slack', 'toSlack()', name);
    }

    const message = handler(notifiable) as SlackMessage;
    const payload = message.toPayload();
    const route = routeFor(notifiable, 'slack', notification);

    if (this.options.token) {
      await this.postViaWebApi(payload, route);
      return;
    }

    const webhookUrl = isHttpsUrl(route) ? route : this.options.webhookUrl;
    if (!webhookUrl) {
      throw new Error(
        'The slack channel needs a webhook URL. Return one from ' +
          'routeNotificationFor("slack"), or set webhookUrl (or token) in forRoot().',
      );
    }

    await this.post(webhookUrl, payload);
  }

  private async postViaWebApi(payload: SlackPayload, route: unknown): Promise<void> {
    const channel =
      typeof route === 'string' && !isHttpsUrl(route) ? route : this.options.defaultChannel;

    await this.post(
      CHAT_POST_MESSAGE_URL,
      { ...payload, channel },
      { Authorization: `Bearer ${this.options.token}` },
    );
  }

  private async post(
    url: string,
    body: object,
    extraHeaders: Record<string, string> = {},
  ): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Slack request to ${url} failed with status ${response.status}.`);
    }
  }
}
