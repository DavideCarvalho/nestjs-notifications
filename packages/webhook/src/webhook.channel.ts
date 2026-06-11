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
import { Inject, Injectable, Optional } from '@nestjs/common';
import { WEBHOOK_OPTIONS, WEBHOOK_OPTIONS_RESOLVER } from './tokens';
import { WebhookMessage } from './webhook-message';
import type { WebhookMethod } from './webhook-message';

/** Channel handle: use as `@Webhook()` on a payload method, or as a token in `via()`. */
export const Webhook = createChannel('webhook');

/** Resolved runtime options for the webhook channel. */
export interface WebhookChannelOptions {
  /** Default URL used when neither the message nor the route supplies one. */
  url?: string;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
}

/**
 * Implement this on a notification to define its webhook payload. Returning a plain
 * object is treated as the JSON body to POST; return a {@link WebhookMessage} for full
 * control over the url, method and headers.
 */
export interface WebhookNotification extends Notification {
  toWebhook(notifiable: Notifiable): WebhookMessage | Record<string, unknown>;
}

/** Resolves per-tenant {@link WebhookChannelOptions} from a tenant id. */
export type WebhookOptionsResolver = (tenant: string) => WebhookChannelOptions;

/**
 * Delivers a notification by sending an HTTP request (JSON body) to a webhook endpoint.
 * The target URL comes from the {@link WebhookMessage}, else from
 * `routeNotificationFor('webhook')` (a URL string), else from the configured default.
 */
@Injectable()
export class WebhookChannel implements ChannelDriver {
  readonly channel = 'webhook';

  constructor(
    @Inject(WEBHOOK_OPTIONS)
    private readonly options: WebhookChannelOptions,
    @Optional()
    @Inject(WEBHOOK_OPTIONS_RESOLVER)
    private readonly resolveOptions?: WebhookOptionsResolver,
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const options =
      context?.tenant && this.resolveOptions ? this.resolveOptions(context.tenant) : this.options;

    const handler = getHandler(notification, 'webhook', 'toWebhook');
    if (!handler) {
      const name =
        (notification.constructor as { notificationName?: string }).notificationName ??
        notification.constructor.name;
      throw new MissingChannelMethodError('webhook', 'toWebhook()', name);
    }

    const result = handler(notifiable) as WebhookMessage | Record<string, unknown>;
    const message =
      result instanceof WebhookMessage ? result : new WebhookMessage().payload(result);
    const request = message.toRequest();

    const route = routeFor(notifiable, 'webhook', notification);
    const url = request.url ?? (typeof route === 'string' ? route : undefined) ?? options.url;

    if (!url) {
      throw new Error(
        'The webhook channel needs a target URL. Set one on the WebhookMessage via .url(), ' +
          'return one from routeNotificationFor("webhook"), or set url in forRoot().',
      );
    }

    await this.post(options, url, request.method, request.body, request.headers);
  }

  private async post(
    options: WebhookChannelOptions,
    url: string,
    method: WebhookMethod,
    body: Record<string, unknown>,
    messageHeaders: Record<string, string>,
  ): Promise<void> {
    const headers: Record<string, string> = {
      ...options.headers,
      ...messageHeaders,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Webhook request to ${url} failed with status ${response.status}.`);
    }
  }
}
