import { Inject, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MAIL_SMTP_OPTIONS } from './tokens';

/** A file attached to an outgoing email. Transport-neutral subset of nodemailer's shape. */
export interface MailAttachment {
  /** Filename shown to the recipient. */
  filename: string;
  /** Inline content. Provide this or {@link MailAttachment.path}. */
  content?: string | Buffer;
  /** A path or URL to read the content from (when `content` is absent). */
  path?: string;
  /** MIME type, e.g. `"application/pdf"`. */
  contentType?: string;
  /** Content-ID for an inline (embedded) attachment referenced from the HTML body. */
  cid?: string;
}

/** The fully-rendered message handed to a transport for delivery. */
export interface MailTransportPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text: string;
  /** Files to attach. Transports that don't support attachments should ignore them. */
  attachments?: MailAttachment[];
}

/** Delivers a rendered email. Swap implementations for different providers. */
export interface MailTransport {
  send(payload: MailTransportPayload): Promise<void>;
}

/** Loose SMTP connection options forwarded to nodemailer's transport. */
export interface SMTPOptions {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  [key: string]: unknown;
}

/** A {@link MailTransport} backed by nodemailer's SMTP transport. */
@Injectable()
export class NodemailerTransport implements MailTransport {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @Inject(MAIL_SMTP_OPTIONS)
    private readonly smtp: SMTPOptions,
  ) {
    this.transporter = nodemailer.createTransport(this.smtp);
  }

  async send(payload: MailTransportPayload): Promise<void> {
    await this.transporter.sendMail({
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    });
  }
}

/**
 * Wraps an ordered list of transports and tries each in turn until one succeeds — a simple
 * provider failover (e.g. SES went down → fall back to Resend). The last error is rethrown
 * if every transport fails.
 *
 * ```ts
 * MailChannelModule.forRoot({
 *   transport: new FailoverMailTransport([sesTransport, resendTransport]),
 * });
 * ```
 */
export class FailoverMailTransport implements MailTransport {
  constructor(
    private readonly transports: MailTransport[],
    private readonly onFailover?: (failed: MailTransport, error: unknown) => void,
  ) {
    if (transports.length === 0) {
      throw new Error('FailoverMailTransport needs at least one transport.');
    }
  }

  async send(payload: MailTransportPayload): Promise<void> {
    let lastError: unknown;
    for (const transport of this.transports) {
      try {
        await transport.send(payload);
        return;
      } catch (error) {
        lastError = error;
        this.onFailover?.(transport, error);
      }
    }
    throw lastError;
  }
}
