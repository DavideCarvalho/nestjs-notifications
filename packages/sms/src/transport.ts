import { Inject, Injectable } from '@nestjs/common';
import twilio from 'twilio';
import { SMS_TWILIO_OPTIONS } from './tokens';

/** The message handed to a transport for delivery. */
export interface SmsTransportPayload {
  to: string;
  from?: string;
  text: string;
}

/** Delivers an SMS. Swap implementations for different providers. */
export interface SmsTransport {
  send(payload: SmsTransportPayload): Promise<void>;
}

/** Options for the built-in {@link TwilioTransport}. */
export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  /** Default sender number for the Twilio account. */
  from?: string;
}

/** An {@link SmsTransport} backed by the `twilio` SDK. */
@Injectable()
export class TwilioTransport implements SmsTransport {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    @Inject(SMS_TWILIO_OPTIONS)
    private readonly options: TwilioOptions,
  ) {
    this.client = twilio(this.options.accountSid, this.options.authToken);
  }

  async send(payload: SmsTransportPayload): Promise<void> {
    await this.client.messages.create({
      to: payload.to,
      from: payload.from ?? this.options.from,
      body: payload.text,
    });
  }
}
