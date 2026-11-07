import { randomUUID } from 'node:crypto';
import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type WebhookMessage as DispatchedWebhookMessage,
  HttpWebhookTransport,
  type HttpWebhookTransportOptions,
  WebhookTransport,
  Webhooks,
} from '@nestjs/webhooks';
import { sha256Signature, standardWebhookHeaders } from './signing';
import { WEBHOOK_OPTIONS, WEBHOOK_OPTIONS_RESOLVER, WEBHOOK_TRANSACTION } from './tokens';
import { WebhookEvent, WebhookMessage } from './webhook-message';

const DEFAULT_SIGNATURE_HEADER = 'X-Signature-256';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Channel handle: use as `@Webhook()` on a payload method, or as a token in `via()`. */
export const Webhook = createChannel('webhook');

/** Opens a transaction for subscription delivery, e.g. `(work) => db.transaction(work)`. */
export type WebhookTransactionRunner = <T>(work: (tx: unknown) => Promise<T>) => Promise<T>;

/** Resolved runtime options for direct-URL delivery. */
export interface WebhookChannelOptions {
  /** Default URL used when neither the message nor the route supplies one. */
  url?: string;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
  /** Signing secret. Unset: requests are not signed. */
  secret?: string;
  /**
   * `'sha256'` (default): `<signatureHeader>: sha256=<hex HMAC of the body>`.
   * `'standard'`: Standard Webhooks headers, verifiable with `@nestjs/webhooks`'
   * `@VerifyWebhook()` and a `scheme: 'standard'` receiver; `secret` is then `whsec_…`.
   */
  signing?: 'sha256' | 'standard';
  /** Header for the `'sha256'` signature. Default `X-Signature-256`. */
  signatureHeader?: string;
  /** Abort a request that takes longer than this (ms). Default 15000. */
  timeoutMs?: number;
  /**
   * The SSRF policy of `@nestjs/webhooks`' `HttpWebhookTransport` (https only, every resolved
   * address checked and pinned, redirects never followed): `allowHttp`, `allowPrivateNetworks`,
   * `allowedAddresses`, `ca`, `maxResponseSize`, `lookup`.
   */
  delivery?: HttpWebhookTransportOptions;
  /**
   * A `@nestjs/webhooks` transport instance to send through instead (a proxy, mTLS, or
   * `InMemoryWebhookTransport` in tests). Takes precedence over `delivery`.
   */
  transport?: WebhookTransport;
}

/**
 * Implement this on a notification to define its webhook payload: a plain object (the JSON body),
 * a {@link WebhookMessage} (url, headers, body), or a {@link WebhookEvent} for subscription
 * delivery through `@nestjs/webhooks`.
 */
export interface WebhookNotification extends Notification {
  toWebhook(ctx: ChannelContext): WebhookMessage | WebhookEvent | Record<string, unknown>;
}

/** Resolves per-tenant {@link WebhookChannelOptions} from a tenant id. */
export type WebhookOptionsResolver = (tenant: string) => WebhookChannelOptions;

/** What a direct delivery returns (the channel response). */
export interface WebhookDeliveryResult {
  /** The `webhook-id` (Standard signing) or a generated id. */
  id: string;
  statusCode: number;
}

/**
 * Delivers a notification as a webhook, two ways:
 *
 * - **Direct**: a signed `POST` of the JSON body to one URL (the message's, else the
 *   `routeNotificationFor('webhook')` URL, else the configured default), through `@nestjs/webhooks`'
 *   SSRF-guarded `HttpWebhookTransport`. A non-2xx answer fails the delivery.
 * - **Subscriptions**: a {@link WebhookEvent} is handed to `Webhooks.dispatch()`, which fans it
 *   out to the endpoints subscribed to its type (for the delivery's tenant), with retries and a
 *   delivery log. Needs `WebhooksModule` + `OutboxModule` and the `transaction` option.
 */
@Injectable()
export class WebhookChannel extends BaseChannel {
  readonly channel = 'webhook';
  private readonly transports = new WeakMap<WebhookChannelOptions, WebhookTransport>();

  constructor(
    @Inject(WEBHOOK_OPTIONS)
    private readonly options: WebhookChannelOptions,
    @Optional()
    @Inject(WEBHOOK_OPTIONS_RESOLVER)
    private readonly resolveOptions?: WebhookOptionsResolver,
    @Optional()
    @Inject(WEBHOOK_TRANSACTION)
    private readonly transaction?: WebhookTransactionRunner,
    @Optional()
    private readonly webhooks?: Webhooks,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<WebhookDeliveryResult | DispatchedWebhookMessage> {
    const result = this.buildPayload<WebhookMessage | WebhookEvent | Record<string, unknown>>(
      notification,
      notifiable,
      'toWebhook',
      context,
    );
    if (result instanceof WebhookEvent) return this.dispatch(result, context);

    const options = this.forTenant(this.options, context, this.resolveOptions);
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

    const body = JSON.stringify(request.body);
    const id = context?.idempotencyKey ?? `msg_${randomUUID().replaceAll('-', '')}`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...lowerCase(options.headers),
      ...lowerCase(request.headers),
    };
    if (options.secret) {
      if (options.signing === 'standard') {
        Object.assign(headers, standardWebhookHeaders(options.secret, id, body));
      } else {
        headers[(options.signatureHeader ?? DEFAULT_SIGNATURE_HEADER).toLowerCase()] =
          sha256Signature(options.secret, body);
      }
    }

    const response = await this.transportFor(options).send(
      {
        url,
        headers,
        body,
        endpointId: 'aviary',
        deliveryId: id,
        messageId: id,
        type: 'notification',
      },
      { signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS), attempt: 1 },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`Webhook request to ${url} failed with status ${response.statusCode}.`);
    }
    return { id, statusCode: response.statusCode };
  }

  private async dispatch(
    event: WebhookEvent,
    context: DeliveryContext | undefined,
  ): Promise<DispatchedWebhookMessage> {
    const webhooks = this.webhooks;
    if (!webhooks) {
      throw new Error(
        'A WebhookEvent needs WebhooksModule (and OutboxModule) from @nestjs/webhooks.',
      );
    }
    if (!this.transaction) {
      throw new Error(
        'A WebhookEvent needs WebhookChannelModule.forRoot({ transaction: (work) => db.transaction(work) }): ' +
          '@nestjs/webhooks writes the event through a transaction.',
      );
    }
    const message = await this.transaction(async (tx) =>
      webhooks.dispatch(tx, {
        type: event.type,
        data: event.data,
        tenant: context?.tenant ?? null,
        // The outbox message id of this delivery: a redelivery dispatches the same webhook-id.
        ...(context?.idempotencyKey ? { id: webhookId(context.idempotencyKey) } : {}),
      }),
    );
    webhooks.notify();
    return message;
  }

  private transportFor(options: WebhookChannelOptions): WebhookTransport {
    if (options.transport) return options.transport;
    let transport = this.transports.get(options);
    if (!transport) {
      transport = new HttpWebhookTransport(options.delivery);
      this.transports.set(options, transport);
    }
    return transport;
  }
}

function lowerCase(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) out[name.toLowerCase()] = value;
  return out;
}

/** `webhook-id` allows letters, digits, `_` and `-`, at most 128. */
function webhookId(key: string): string {
  return `msg_${key.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 128);
}
