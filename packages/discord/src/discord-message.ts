/** The JSON body shape posted to a Discord webhook. */
export interface DiscordPayload {
  content?: string;
  embeds?: object[];
}

/**
 * A fluent builder for a Discord webhook message.
 *
 * ```ts
 * new DiscordMessage()
 *   .content('Deploy finished')
 *   .embed({ title: 'Done!', description: 'Shipped to production' });
 * ```
 */
export class DiscordMessage {
  private _content?: string;
  private _embeds: object[] = [];

  /** Set the message content (plain text, up to 2000 chars on Discord). */
  content(s: string): this {
    this._content = s;
    return this;
  }

  /** Append a single embed object. */
  embed(e: object): this {
    this._embeds.push(e);
    return this;
  }

  /** Append multiple embed objects. */
  embeds(es: object[]): this {
    this._embeds.push(...es);
    return this;
  }

  get textContent(): string | undefined {
    return this._content;
  }

  get embedList(): object[] {
    return this._embeds;
  }

  /** Serialize to the JSON body Discord expects, omitting empty collections. */
  toPayload(): DiscordPayload {
    const payload: DiscordPayload = {};
    if (this._content !== undefined) payload.content = this._content;
    if (this._embeds.length > 0) payload.embeds = this._embeds;
    return payload;
  }
}
