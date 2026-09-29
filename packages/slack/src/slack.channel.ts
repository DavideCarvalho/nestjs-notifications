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

/**
 * Resolves per-tenant {@link SlackChannelOptions} from a tenant id. May be async (e.g. load the
 * tenant's bot token from a database); the channel awaits it on every tenant-scoped delivery.
 */
export type SlackOptionsResolver = (
  tenant: string,
) => SlackChannelOptions | Promise<SlackChannelOptions>;

/**
 * What {@link SlackChannel.send} resolves to — surfaced as the `response` of the slack
 * `ChannelResult` in the `SendResult`, passed to `afterSending(notifiable, 'slack', response)` and
 * carried on the `notification.sent` event.
 *
 * - Web API (`token` configured): `{ channel, ts }` from Slack's `chat.postMessage` response — the
 *   posted message's channel id and timestamp (use them to thread replies or update the message).
 * - Incoming webhook: `{ webhook: true }` — webhooks don't return the message id.
 */
export type SlackDeliveryResult = { channel: string; ts: string } | { webhook: true };

/** The subset of Slack's `chat.postMessage` JSON response the channel reads. */
interface ChatPostMessageResponse {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
}

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
  ): Promise<SlackDeliveryResult> {
    // The resolver may be async; `await` is a no-op for the sync case and the static options.
    const options = await this.forTenant<SlackChannelOptions | Promise<SlackChannelOptions>>(
      this.options,
      context,
      this.resolveOptions,
    );
    const message = this.buildPayload<SlackMessage>(notification, notifiable, 'toSlack', context);
    const payload = message.toPayload();
    const route = routeFor(notifiable, 'slack', notification);

    if (options.token) {
      const channel =
        typeof route === 'string' && !isHttpsUrl(route) ? route : options.defaultChannel;
      const response = await postJson(
        CHAT_POST_MESSAGE_URL,
        { ...payload, channel },
        { label: 'Slack', headers: { Authorization: `Bearer ${options.token}` } },
      );
      return parseChatPostMessage(response, channel);
    }

    const webhookUrl = isHttpsUrl(route) ? route : options.webhookUrl;
    if (!webhookUrl) {
      throw new Error(
        'The slack channel needs a webhook URL. Return one from ' +
          'routeNotificationFor("slack"), or set webhookUrl (or token) in forRoot().',
      );
    }

    await postJson(webhookUrl, payload, { label: 'Slack' });
    return { webhook: true };
  }
}

/**
 * Slack's Web API answers HTTP 200 even on failure, with `{ ok: false, error }` in the body — so a
 * 2xx alone isn't success. Throw a descriptive error in that case; otherwise return the posted
 * message's `{ channel, ts }`.
 */
async function parseChatPostMessage(
  response: Response,
  requestedChannel: string | undefined,
): Promise<SlackDeliveryResult> {
  let body: ChatPostMessageResponse;
  try {
    body = (await response.json()) as ChatPostMessageResponse;
  } catch {
    throw new Error('Slack chat.postMessage returned a non-JSON response.');
  }
  if (!body || body.ok !== true) {
    const target = requestedChannel ? ` to channel "${requestedChannel}"` : '';
    throw new Error(`Slack chat.postMessage${target} failed: ${body?.error ?? 'unknown_error'}.`);
  }
  return { channel: body.channel ?? requestedChannel ?? '', ts: body.ts ?? '' };
}
