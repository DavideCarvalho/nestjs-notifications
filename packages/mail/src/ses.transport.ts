import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { MailTransport, MailTransportPayload } from './transport';

/** The slice of an AWS SES v2 client (`@aws-sdk/client-sesv2`'s `SESv2Client`) this transport uses. */
export interface SesV2Client {
  send(command: unknown): Promise<unknown>;
}

export interface SesTransportOptions {
  /** A configured `@aws-sdk/client-sesv2` `SESv2Client`. */
  client: SesV2Client;
  /** Fallback sender used when a message sets no `from`. */
  from?: string;
}

/**
 * A {@link MailTransport} backed by AWS SES v2. Unlike SES "Simple" content (subject/html/text only),
 * this builds a full MIME message with nodemailer's `MailComposer` and sends it as `Content.Raw`, so
 * **attachments are supported**. Requires the optional `@aws-sdk/client-sesv2` peer (imported lazily).
 *
 * ```ts
 * import { SESv2Client } from '@aws-sdk/client-sesv2';
 * MailChannelModule.forRoot({
 *   transportInstance: new SesTransport({ client: new SESv2Client({ region: 'us-east-1' }) }),
 * });
 * ```
 */
export class SesTransport implements MailTransport {
  constructor(private readonly options: SesTransportOptions) {}

  async send(payload: MailTransportPayload): Promise<void> {
    const raw = await composeRawEmail(payload, this.options.from);
    // Lazy + indirect specifier so the AWS SDK stays an optional peer (no compile-time resolution).
    const sdkSpecifier = '@aws-sdk/client-sesv2';
    const { SendEmailCommand } = (await import(sdkSpecifier)) as {
      SendEmailCommand: new (input: {
        Content: { Raw: { Data: Uint8Array } };
      }) => unknown;
    };
    await this.options.client.send(new SendEmailCommand({ Content: { Raw: { Data: raw } } }));
  }
}

/** Build a raw MIME message (with attachments) from a rendered payload, via nodemailer's composer. */
export function composeRawEmail(
  payload: MailTransportPayload,
  defaultFrom?: string,
): Promise<Buffer> {
  const composer = new MailComposer({
    from: payload.from ?? defaultFrom,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    attachments: payload.attachments,
  });
  return new Promise<Buffer>((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}
