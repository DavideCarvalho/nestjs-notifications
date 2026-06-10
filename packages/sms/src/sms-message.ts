/**
 * A simple value/builder for an SMS notification.
 *
 * ```ts
 * new SmsMessage()
 *   .content('Your code is 123456')
 *   .from('+15555550100');
 * ```
 *
 * As a shorthand, a notification's `toSms()` may instead return a plain string,
 * which is treated as the message body.
 */
export class SmsMessage {
  private _text = '';
  private _from?: string;

  /** Set the SMS body text. */
  content(text: string): this {
    this._text = text;
    return this;
  }

  /** Override the sender number for this message. */
  from(number: string): this {
    this._from = number;
    return this;
  }

  /** The SMS body text. */
  get text(): string {
    return this._text;
  }

  /** The sender number override, if any. */
  get fromNumber(): string | undefined {
    return this._from;
  }
}
