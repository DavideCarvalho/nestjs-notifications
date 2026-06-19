import { createHmac } from 'node:crypto';
import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  postJson,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { WEBHOOK_OPTIONS, WEBHOOK_OPTIONS_RESOLVER } from './tokens';
import { WebhookMessage } from './webhook-message';

const DEFAULT_SIGNATURE_HEADER = 'X-Signature-256';

/** Channel handle: use as `@Webhook()` on a payload method, or as a token in `via()`. */
export const Webhook = createChannel('webhook');

/** Resolved runtime options for the webhook channel. */
export interface WebhookChannelOptions {
  /** Default URL used when neither the message nor the route supplies one. */
  url?: string;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
  /**
   * HMAC-SHA256 secret. When set, the request is signed: the header (default
   * `X-Signature-256`) is set to `sha256=<hex digest of the raw JSON body>`, so the receiver
   * can verify authenticity. Per-tenant secrets work via `resolveOptions`.
   */
  secret?: string;
  /** Header name for the signature. Default `X-Signature-256`. */
  signatureHeader?: string;
}

/**
 * Implement this on a notification to define its webhook payload. Returning a plain
 * object is treated as the JSON body to POST; return a {@link WebhookMessage} for full
 * control over the url, method and headers.
 */
export interface WebhookNotification extends Notification {
  toWebhook(ctx: ChannelContext): WebhookMessage | Record<string, unknown>;
}

/** Resolves per-tenant {@link WebhookChannelOptions} from a tenant id. */
export type WebhookOptionsResolver = (tenant: string) => WebhookChannelOptions;

/**
 * Delivers a notification by sending an HTTP request (JSON body) to a webhook endpoint.
 * The target URL comes from the {@link WebhookMessage}, else from
 * `routeNotificationFor('webhook')` (a URL string), else from the configured default.
 */
@Injectable()
export class WebhookChannel extends BaseChannel {
  readonly channel = 'webhook';

  constructor(
    @Inject(WEBHOOK_OPTIONS)
    private readonly options: WebhookChannelOptions,
    @Optional()
    @Inject(WEBHOOK_OPTIONS_RESOLVER)
    private readonly resolveOptions?: WebhookOptionsResolver,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const options = this.forTenant(this.options, context, this.resolveOptions);
    const result = this.buildPayload<WebhookMessage | Record<string, unknown>>(
      notification,
      notifiable,
      'toWebhook',
      context,
    );
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

    const headers: Record<string, string> = { ...options.headers, ...request.headers };
    if (options.secret) {
      const signature = createHmac('sha256', options.secret)
        .update(JSON.stringify(request.body))
        .digest('hex');
      headers[options.signatureHeader ?? DEFAULT_SIGNATURE_HEADER] = `sha256=${signature}`;
    }

    await postJson(url, request.body, { label: 'Webhook', method: request.method, headers });
  }
}
