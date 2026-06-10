import type { MailTransport, MailTransportPayload } from '@nestjs-notifications/mail';
import { Injectable } from '@nestjs/common';

/** A {@link MailTransport} that captures messages in memory instead of sending them. */
@Injectable()
export class MemoryTransport implements MailTransport {
  readonly sent: MailTransportPayload[] = [];

  async send(payload: MailTransportPayload): Promise<void> {
    this.sent.push(payload);
  }
}
