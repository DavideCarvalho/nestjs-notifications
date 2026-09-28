import { Injectable, Logger } from '@nestjs/common';
import type { MailTransport, MailTransportPayload } from './transport';

/**
 * A {@link MailTransport} that writes each message to the Nest logger instead of sending it — the
 * "log" mail driver for local development. The text body (including any links, e.g. an invite or
 * magic link) lands in the application log, so never use it in production.
 */
@Injectable()
export class LogMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  async send(payload: MailTransportPayload): Promise<void> {
    const attachments = payload.attachments?.length
      ? ` attachments=${payload.attachments.map((a) => a.filename).join(',')}`
      : '';
    this.logger.log(
      `mail to=${payload.to}${payload.from ? ` from=${payload.from}` : ''} subject=${JSON.stringify(payload.subject)}${attachments}\n${payload.text}`,
    );
  }
}

/**
 * A {@link MailTransport} that drops every message — for environments where outgoing mail is
 * deliberately disabled (e.g. an air-gapped install with no relay configured, or CI). Each drop is
 * logged at debug level so it stays visible when needed.
 */
@Injectable()
export class NullMailTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  async send(payload: MailTransportPayload): Promise<void> {
    this.logger.debug(
      `mail disabled; dropped message to=${payload.to} subject=${JSON.stringify(payload.subject)}`,
    );
  }
}
