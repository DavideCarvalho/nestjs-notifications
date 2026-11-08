/** The resolved request description produced by {@link WebhookMessage.toRequest}. */
export interface WebhookRequest {
  /** Target URL, when set on the message; otherwise resolved by the channel. */
  url?: string | undefined;
  headers: Record<string, string>;
  /** The JSON body to POST (a plain object). */
  body: Record<string, unknown>;
}

/**
 * A fluent builder for a direct webhook request (always a `POST` with a JSON body).
 *
 * ```ts
 * new WebhookMessage()
 *   .url('https://example.com/hooks/orders')
 *   .header('X-App', 'shop')
 *   .payload({ event: 'order.paid', id: 42 });
 * ```
 */
export class WebhookMessage {
  private _url?: string;
  private _headers: Record<string, string> = {};
  private _payload: Record<string, unknown> = {};

  /** Set the target URL (overrides the route and configured default). */
  url(u: string): this {
    this._url = u;
    return this;
  }

  /** Set the JSON body to send. */
  payload(obj: Record<string, unknown>): this {
    this._payload = obj;
    return this;
  }

  /** Set a single request header. */
  header(key: string, value: string): this {
    this._headers[key] = value;
    return this;
  }

  /** Merge multiple request headers. */
  headers(obj: Record<string, string>): this {
    this._headers = { ...this._headers, ...obj };
    return this;
  }

  get urlValue(): string | undefined {
    return this._url;
  }

  get headerValues(): Record<string, string> {
    return this._headers;
  }

  get payloadValue(): Record<string, unknown> {
    return this._payload;
  }

  /** Serialize to a {@link WebhookRequest}. */
  toRequest(): WebhookRequest {
    return { url: this._url, headers: { ...this._headers }, body: this._payload };
  }
}

/**
 * A webhook event for subscription delivery: `@nestjs/webhooks` fans it out to every endpoint of
 * the tenant subscribed to `type`, signs it (Standard Webhooks), retries and logs each delivery.
 * Return one from `toWebhook(ctx)` instead of a {@link WebhookMessage}.
 *
 * ```ts
 * toWebhook() { return new WebhookEvent('invoice.paid', { id: this.invoice.id }); }
 * ```
 */
export class WebhookEvent<D = unknown> {
  constructor(
    /** Full-stop delimited: `invoice.paid`. In `WebhooksModule`'s `eventTypes` when that is set. */
    readonly type: string,
    /** JSON-serializable data, sent as the body's `data`. */
    readonly data: D,
  ) {}
}
