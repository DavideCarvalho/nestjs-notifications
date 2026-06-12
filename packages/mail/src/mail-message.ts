import type { MailAttachment } from './transport';

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
  private _react?: unknown;
  private _mjml?: string;
  private _attachments: MailAttachment[] = [];

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

  /**
   * Set a React element as the body. Rendered to HTML by {@link ReactEmailRenderer}
   * (requires the optional `react` + `@react-email/render` peers).
   *
   * ```ts
   * new MailMessage().subject('Hi').react(<WelcomeEmail name="Ada" />);
   * ```
   */
  react(element: unknown): this {
    this._react = element;
    return this;
  }

  /**
   * Set an MJML body. Compiled to responsive HTML by {@link MjmlMailRenderer}
   * (requires the optional `mjml` peer).
   */
  mjml(markup: string): this {
    this._mjml = markup;
    return this;
  }

  /**
   * Attach a file. Call repeatedly to add several. The body renderer ignores attachments —
   * they're carried through to the transport.
   *
   * ```ts
   * new MailMessage().subject('Report').attach({ filename: 'report.pdf', content: pdfBuffer });
   * ```
   */
  attach(attachment: MailAttachment): this {
    this._attachments.push(attachment);
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

  get reactBody(): unknown {
    return this._react;
  }

  get mjmlBody(): string | undefined {
    return this._mjml;
  }

  get attachments(): MailAttachment[] {
    return this._attachments;
  }
}
