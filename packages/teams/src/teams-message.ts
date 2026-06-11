/** The JSON body shape posted to a Microsoft Teams incoming webhook (legacy MessageCard). */
export interface TeamsPayload {
  '@type': 'MessageCard';
  '@context': 'http://schema.org/extensions';
  summary: string;
  title?: string;
  text?: string;
}

/**
 * A fluent builder for a Microsoft Teams message. By default produces a legacy
 * MessageCard payload; use {@link card} to post a fully custom payload instead
 * (for example an Adaptive Card attachment).
 *
 * ```ts
 * new TeamsMessage().title('Deploy finished').text('Shipped to production');
 * ```
 */
export class TeamsMessage {
  private _title?: string;
  private _text?: string;
  private _card?: Record<string, unknown>;

  /** Set the card title. */
  title(s: string): this {
    this._title = s;
    return this;
  }

  /** Set the card body text. */
  text(s: string): this {
    this._text = s;
    return this;
  }

  /**
   * Provide a fully custom payload (MessageCard or an Adaptive Card envelope). When set,
   * it is posted verbatim and the fluent title/text are ignored.
   */
  card(c: Record<string, unknown>): this {
    this._card = c;
    return this;
  }

  get titleContent(): string | undefined {
    return this._title;
  }

  get textContent(): string | undefined {
    return this._text;
  }

  /** Serialize to the JSON body Teams expects (a MessageCard, unless a custom card was set). */
  toPayload(): TeamsPayload | Record<string, unknown> {
    if (this._card !== undefined) return this._card;

    const payload: TeamsPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: this._title ?? this._text ?? 'Notification',
    };
    if (this._title !== undefined) payload.title = this._title;
    if (this._text !== undefined) payload.text = this._text;
    return payload;
  }
}
