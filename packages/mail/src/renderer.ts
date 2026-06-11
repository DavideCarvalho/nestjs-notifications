import { Injectable } from '@nestjs/common';
import { marked } from 'marked';
import type { MailMessage } from './mail-message';

/** Produces the html + text bodies for a {@link MailMessage}. */
export interface MailRenderer {
  render(message: MailMessage): { html: string; text: string };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renders a {@link MailMessage} to simple, semantic HTML and a plain-text fallback.
 * Greeting becomes an `<h1>`, body lines become `<p>`s, and the action becomes a
 * styled `<a>` button.
 */
@Injectable()
export class DefaultMailRenderer implements MailRenderer {
  render(message: MailMessage): { html: string; text: string } {
    return { html: this.toHtml(message), text: this.toText(message) };
  }

  private toHtml(message: MailMessage): string {
    const parts: string[] = ['<body>'];

    if (message.greetingText) {
      parts.push(`<h1>${escapeHtml(message.greetingText)}</h1>`);
    }

    for (const line of message.lines) {
      parts.push(`<p>${escapeHtml(line)}</p>`);
    }

    if (message.actionText && message.actionUrl) {
      const style =
        'display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;';
      parts.push(
        `<p><a href="${escapeHtml(message.actionUrl)}" style="${style}">${escapeHtml(message.actionText)}</a></p>`,
      );
    }

    if (message.salutationText) {
      parts.push(`<p>${escapeHtml(message.salutationText)}</p>`);
    }

    parts.push('</body>');
    return parts.join('\n');
  }

  private toText(message: MailMessage): string {
    const parts: string[] = [];

    if (message.greetingText) parts.push(message.greetingText);
    for (const line of message.lines) parts.push(line);
    if (message.actionText && message.actionUrl) {
      parts.push(`${message.actionText}: ${message.actionUrl}`);
    }
    if (message.salutationText) parts.push(message.salutationText);

    return parts.join('\n\n');
  }
}

/**
 * Renders a {@link MailMessage}'s Markdown body (set via `.markdown()`) to HTML using
 * the optional `marked` package. The plain-text fallback is the raw markdown. When a
 * message has no markdown body it falls back to {@link DefaultMailRenderer}'s output.
 *
 * Pick this renderer per app:
 *
 * ```ts
 * MailChannelModule.forRoot({ renderer: MarkdownMailRenderer });
 * ```
 */
@Injectable()
export class MarkdownMailRenderer implements MailRenderer {
  private readonly fallback = new DefaultMailRenderer();

  render(message: MailMessage): { html: string; text: string } {
    const md = message.markdownBody;
    if (md == null) {
      return this.fallback.render(message);
    }

    const html = marked.parse(md, { async: false }) as string;
    return { html, text: md };
  }
}
