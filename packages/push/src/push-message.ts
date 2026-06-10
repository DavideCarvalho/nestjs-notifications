/** The plain-object form of a {@link PushMessage}, handed to transports. */
export interface PushPayload {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  icon?: string;
  url?: string;
}

/**
 * A fluent builder for a push notification, mirroring the other channel builders.
 *
 * ```ts
 * new PushMessage()
 *   .title('Order shipped')
 *   .body('Your order is on its way.')
 *   .icon('https://app.example.com/icon.png')
 *   .url('https://app.example.com/orders/42')
 *   .data({ orderId: 42 });
 * ```
 */
export class PushMessage {
  private _title?: string;
  private _body?: string;
  private _data?: Record<string, unknown>;
  private _icon?: string;
  private _url?: string;

  /** Set the notification title. */
  title(s: string): this {
    this._title = s;
    return this;
  }

  /** Set the notification body text. */
  body(s: string): this {
    this._body = s;
    return this;
  }

  /** Attach an arbitrary data payload (delivered alongside the notification). */
  data(obj: Record<string, unknown>): this {
    this._data = obj;
    return this;
  }

  /** Set the notification icon URL. */
  icon(s: string): this {
    this._icon = s;
    return this;
  }

  /** Set the URL opened when the notification is tapped. */
  url(s: string): this {
    this._url = s;
    return this;
  }

  get titleText(): string | undefined {
    return this._title;
  }

  get bodyText(): string | undefined {
    return this._body;
  }

  get dataPayload(): Record<string, unknown> | undefined {
    return this._data;
  }

  get iconUrl(): string | undefined {
    return this._icon;
  }

  get linkUrl(): string | undefined {
    return this._url;
  }

  /** Serialize to a plain object, omitting fields that were never set. */
  toObject(): PushPayload {
    const payload: PushPayload = {};
    if (this._title !== undefined) payload.title = this._title;
    if (this._body !== undefined) payload.body = this._body;
    if (this._data !== undefined) payload.data = this._data;
    if (this._icon !== undefined) payload.icon = this._icon;
    if (this._url !== undefined) payload.url = this._url;
    return payload;
  }
}
