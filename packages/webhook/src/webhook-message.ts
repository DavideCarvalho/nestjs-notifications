/** The HTTP method used for a webhook request. */
export type WebhookMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET';

/** The resolved request description produced by {@link WebhookMessage.toRequest}. */
export interface WebhookRequest {
  /** Target URL, when set on the message; otherwise resolved by the channel. */
  url?: string | undefined;
  method: WebhookMethod;
  headers: Record<string, string>;
  /** The JSON body to send (a plain object). */
  body: Record<string, unknown>;
}

/**
 * A fluent builder for a webhook request.
 *
 * ```ts
 * new WebhookMessage()
 *   .url('https://example.com/hooks/orders')
 *   .header('X-Signature', sign(payload))
 *   .payload({ event: 'order.paid', id: 42 });
 * ```
 */
export class WebhookMessage {
  private _url?: string;
  private _method: WebhookMethod = 'POST';
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

  /** Set the HTTP method (default `POST`). */
  method(m: WebhookMethod): this {
    this._method = m;
    return this;
  }

  get urlValue(): string | undefined {
    return this._url;
  }

  get methodValue(): WebhookMethod {
    return this._method;
  }

  get headerValues(): Record<string, string> {
    return this._headers;
  }

  get payloadValue(): Record<string, unknown> {
    return this._payload;
  }

  /** Serialize to a {@link WebhookRequest}. */
  toRequest(): WebhookRequest {
    return {
      url: this._url,
      method: this._method,
      headers: { ...this._headers },
      body: this._payload,
    };
  }
}
