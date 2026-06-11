/**
 * A fluent builder for an email notification, mirroring Laravel's `MailMessage`.
 *
 * ```ts
 * new MailMessage()
 *   .subject('Welcome')
 *   .greeting('Hello!')
 *   .line('Thanks for signing up.')
 *   .action('Get started', 'https://app.example.com')
 *   .salutation('Cheers, the team');
 * ```
 */
export class MailMessage {
  private _from?: string;
  private _subject = '';
  private _greeting?: string;
  private _lines: string[] = [];
  private _actionText?: string;
  private _actionUrl?: string;
  private _salutation?: string;
  private _markdown?: string;

  /** Override the sender address for this message. */
  from(addr: string): this {
    this._from = addr;
    return this;
  }

  /** Set the email subject line. */
  subject(s: string): this {
    this._subject = s;
    return this;
  }

  /** Set the leading greeting line (rendered prominently). */
  greeting(s: string): this {
    this._greeting = s;
    return this;
  }

  /** Append a paragraph to the body. */
  line(s: string): this {
    this._lines.push(s);
    return this;
  }

  /** Add a single call-to-action button. */
  action(text: string, url: string): this {
    this._actionText = text;
    this._actionUrl = url;
    return this;
  }

  /** Set the closing salutation line. */
  salutation(s: string): this {
    this._salutation = s;
    return this;
  }

  /**
   * Set a Markdown body for this message. Rendered to HTML by
   * {@link MarkdownMailRenderer}; ignored by the {@link DefaultMailRenderer}.
   */
  markdown(md: string): this {
    this._markdown = md;
    return this;
  }

  get fromAddress(): string | undefined {
    return this._from;
  }

  get subjectLine(): string {
    return this._subject;
  }

  get greetingText(): string | undefined {
    return this._greeting;
  }

  get lines(): string[] {
    return this._lines;
  }

  get actionText(): string | undefined {
    return this._actionText;
  }

  get actionUrl(): string | undefined {
    return this._actionUrl;
  }

  get salutationText(): string | undefined {
    return this._salutation;
  }

  get markdownBody(): string | undefined {
    return this._markdown;
  }
}
