import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  isHttpsUrl,
  postJson,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { SlackMessage } from './slack-message';
import { SLACK_OPTIONS, SLACK_OPTIONS_RESOLVER } from './tokens';

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

/** Resolves per-tenant {@link SlackChannelOptions} from a tenant id. */
export type SlackOptionsResolver = (tenant: string) => SlackChannelOptions;

/** Implement this on a notification to define its Slack payload. */
export interface SlackNotification extends Notification {
  toSlack(ctx: ChannelContext): SlackMessage;
}

/**
 * Delivers a notification to Slack via an incoming webhook, or the Web API
 * (`chat.postMessage`) when a bot token is configured. The route from
 * `routeNotificationFor('slack')` may be a webhook URL or a channel id.
 */
@Injectable()
export class SlackChannel extends BaseChannel {
  readonly channel = 'slack';

  constructor(
    @Inject(SLACK_OPTIONS)
    private readonly options: SlackChannelOptions,
    @Optional()
    @Inject(SLACK_OPTIONS_RESOLVER)
    private readonly resolveOptions?: SlackOptionsResolver,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const options = this.forTenant(this.options, context, this.resolveOptions);
    const message = this.buildPayload<SlackMessage>(notification, notifiable, 'toSlack', context);
    const payload = message.toPayload();
    const route = routeFor(notifiable, 'slack', notification);

    if (options.token) {
      const channel =
        typeof route === 'string' && !isHttpsUrl(route) ? route : options.defaultChannel;
      await postJson(
        CHAT_POST_MESSAGE_URL,
        { ...payload, channel },
        { label: 'Slack', headers: { Authorization: `Bearer ${options.token}` } },
      );
      return;
    }

    const webhookUrl = isHttpsUrl(route) ? route : options.webhookUrl;
    if (!webhookUrl) {
      throw new Error(
        'The slack channel needs a webhook URL. Return one from ' +
          'routeNotificationFor("slack"), or set webhookUrl (or token) in forRoot().',
      );
    }

    await postJson(webhookUrl, payload, { label: 'Slack' });
  }
}
