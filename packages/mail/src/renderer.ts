import { Injectable } from '@nestjs/common';
import { marked } from 'marked';
import type { MailMessage } from './mail-message';

/** The rendered email bodies. */
export interface RenderedMail {
  html: string;
  text: string;
}

/** Produces the html + text bodies for a {@link MailMessage}. May be async (e.g. react-email). */
export interface MailRenderer {
  render(message: MailMessage): RenderedMail | Promise<RenderedMail>;
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

/**
 * Renders a {@link MailMessage}'s React element (set via `.react(<Email/>)`) to HTML using the
 * optional `@react-email/render` + `react` peers — build emails with React components. Falls
 * back to {@link DefaultMailRenderer} when the message has no React body.
 *
 * ```ts
 * MailChannelModule.forRoot({ renderer: ReactEmailRenderer });
 * // in a notification: new MailMessage().subject('Hi').react(<WelcomeEmail name="Ada" />)
 * ```
 */
@Injectable()
export class ReactEmailRenderer implements MailRenderer {
  private readonly fallback = new DefaultMailRenderer();

  async render(message: MailMessage): Promise<RenderedMail> {
    const element = message.reactBody;
    if (element == null) {
      return this.fallback.render(message);
    }
    // Imported lazily so apps that don't use React emails needn't install the peers.
    const { render } = (await import('@react-email/render')) as {
      render: (el: unknown, options?: { plainText?: boolean }) => Promise<string> | string;
    };
    const [html, text] = await Promise.all([
      Promise.resolve(render(element)),
      Promise.resolve(render(element, { plainText: true })),
    ]);
    return { html, text };
  }
}

/**
 * Compiles a {@link MailMessage}'s MJML body (set via `.mjml('<mjml>…')`) to responsive HTML
 * using the optional `mjml` peer. Falls back to {@link DefaultMailRenderer} when the message
 * has no MJML body.
 *
 * ```ts
 * MailChannelModule.forRoot({ renderer: MjmlMailRenderer });
 * ```
 */
@Injectable()
export class MjmlMailRenderer implements MailRenderer {
  private readonly fallback = new DefaultMailRenderer();

  async render(message: MailMessage): Promise<RenderedMail> {
    const markup = message.mjmlBody;
    if (markup == null) {
      return this.fallback.render(message);
    }
    // Imported lazily so apps that don't use MJML needn't install the peer.
    const mod = (await import('mjml')) as unknown as {
      default?: (mjml: string) => { html: string };
    };
    const mjml2html = mod.default ?? (mod as unknown as (mjml: string) => { html: string });
    const { html } = mjml2html(markup);
    // Strip tags for a best-effort plain-text fallback.
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { html, text };
  }
}
