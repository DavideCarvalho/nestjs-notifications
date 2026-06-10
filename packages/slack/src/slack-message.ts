/** The JSON body shape posted to Slack (webhook or Web API). */
export interface SlackPayload {
  text?: string;
  blocks?: object[];
  attachments?: object[];
}

/**
 * A fluent builder for a Slack message.
 *
 * ```ts
 * new SlackMessage()
 *   .text('Deploy finished')
 *   .block({ type: 'section', text: { type: 'mrkdwn', text: '*Done!*' } });
 * ```
 */
export class SlackMessage {
  private _text?: string;
  private _blocks: object[] = [];
  private _attachments: object[] = [];

  /** Set the fallback/notification text. */
  text(s: string): this {
    this._text = s;
    return this;
  }

  /** Append a Block Kit block. */
  block(b: object): this {
    this._blocks.push(b);
    return this;
  }

  /** Append a legacy attachment. */
  attachment(a: object): this {
    this._attachments.push(a);
    return this;
  }

  get textContent(): string | undefined {
    return this._text;
  }

  get blocks(): object[] {
    return this._blocks;
  }

  get attachments(): object[] {
    return this._attachments;
  }

  /** Serialize to the JSON body Slack expects, omitting empty collections. */
  toPayload(): SlackPayload {
    const payload: SlackPayload = {};
    if (this._text !== undefined) payload.text = this._text;
    if (this._blocks.length > 0) payload.blocks = this._blocks;
    if (this._attachments.length > 0) payload.attachments = this._attachments;
    return payload;
  }
}
