import { Inject, Injectable } from '@nestjs/common';
import { Vonage } from '@vonage/server-sdk';
import { SMS_VONAGE_OPTIONS } from './tokens';
import type { SmsTransport, SmsTransportPayload } from './transport';

/** Options for the {@link VonageTransport}. */
export interface VonageOptions {
  apiKey: string;
  apiSecret: string;
  /** Default sender id / number for messages that don't set their own. */
  from?: string;
}

/** An {@link SmsTransport} backed by the `@vonage/server-sdk` SMS API. */
@Injectable()
export class VonageTransport implements SmsTransport {
  private readonly client: Vonage;

  constructor(
    @Inject(SMS_VONAGE_OPTIONS)
    private readonly options: VonageOptions,
  ) {
    this.client = new Vonage({
      apiKey: this.options.apiKey,
      apiSecret: this.options.apiSecret,
    });
  }

  async send(payload: SmsTransportPayload): Promise<void> {
    await this.client.sms.send({
      to: payload.to,
      from: payload.from ?? this.options.from ?? '',
      text: payload.text,
    });
  }
}
