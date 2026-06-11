/** Telegram `parse_mode` values for `sendMessage`. */
export type TelegramParseMode = 'MarkdownV2' | 'Markdown' | 'HTML';

/** The body shape (sans `chat_id`) posted to the Telegram `sendMessage` endpoint. */
export interface TelegramPayload {
  text: string;
  parse_mode?: TelegramParseMode;
}

/**
 * A fluent builder for a Telegram message.
 *
 * ```ts
 * new TelegramMessage().text('*Deploy finished*').parseMode('MarkdownV2');
 * ```
 */
export class TelegramMessage {
  private _text = '';
  private _parseMode?: TelegramParseMode;

  constructor(text?: string) {
    if (text !== undefined) this._text = text;
  }

  /** Set the message text. */
  text(s: string): this {
    this._text = s;
    return this;
  }

  /** Set the `parse_mode` used to render the text. */
  parseMode(mode: TelegramParseMode): this {
    this._parseMode = mode;
    return this;
  }

  get textContent(): string {
    return this._text;
  }

  get parseModeValue(): TelegramParseMode | undefined {
    return this._parseMode;
  }

  /** Serialize to the JSON body Telegram expects, omitting an absent parse mode. */
  toPayload(): TelegramPayload {
    const payload: TelegramPayload = { text: this._text };
    if (this._parseMode !== undefined) payload.parse_mode = this._parseMode;
    return payload;
  }
}
