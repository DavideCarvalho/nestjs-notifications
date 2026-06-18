import { failover } from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import twilio from 'twilio';
import { SMS_TWILIO_OPTIONS } from './tokens';

/** The message handed to a transport for delivery. */
export interface SmsTransportPayload {
  to: string;
  from?: string | undefined;
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
    const from = payload.from ?? this.options.from;
    await this.client.messages.create({
      to: payload.to,
      // Include `from` only when set (exactOptionalPropertyTypes); Twilio falls back to the
      // account's messaging service / default number when it is omitted.
      ...(from !== undefined ? { from } : {}),
      body: payload.text,
    });
  }
}

/**
 * Wraps an ordered list of SMS transports and tries each in turn until one succeeds — provider
 * failover (e.g. Twilio is down → fall back to Vonage). The last error is rethrown if every
 * transport fails. Mirrors `FailoverMailTransport`; both delegate to core's `failover()`.
 *
 * ```ts
 * SmsChannelModule.forRoot({
 *   transportInstance: new FailoverSmsTransport([twilioTransport, vonageTransport]),
 * });
 * ```
 */
export class FailoverSmsTransport implements SmsTransport {
  constructor(
    private readonly transports: SmsTransport[],
    private readonly onFailover?: (failed: SmsTransport, error: unknown) => void,
  ) {
    if (transports.length === 0) {
      throw new Error('FailoverSmsTransport needs at least one transport.');
    }
  }

  async send(payload: SmsTransportPayload): Promise<void> {
    await failover(
      this.transports,
      (transport) => transport.send(payload),
      this.onFailover && ((transport, error) => this.onFailover?.(transport, error)),
    );
  }
}
