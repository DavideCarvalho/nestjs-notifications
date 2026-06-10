import { Inject, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { MAIL_SMTP_OPTIONS } from './tokens';

/** The fully-rendered message handed to a transport for delivery. */
export interface MailTransportPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text: string;
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
    });
  }
}
