import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Inject, Injectable } from '@nestjs/common';
import { SMS_SNS_OPTIONS } from './tokens';
import type { SmsTransport, SmsTransportPayload } from './transport';

/** Options for the {@link SnsTransport}. */
export interface SnsOptions {
  /** AWS region the SNS client publishes through (e.g. `us-east-1`). */
  region: string;
  /** Explicit credentials. Omit to use the default AWS credential provider chain. */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Alphanumeric sender id applied as an SMS message attribute. */
  senderId?: string;
}

/**
 * An {@link SmsTransport} backed by AWS SNS (`@aws-sdk/client-sns`).
 *
 * Publishes directly to the recipient's phone number. Note SNS does not support a
 * per-message `from` number, so `payload.from` is ignored; use `senderId` instead.
 */
@Injectable()
export class SnsTransport implements SmsTransport {
  private readonly client: SNSClient;

  constructor(
    @Inject(SMS_SNS_OPTIONS)
    private readonly options: SnsOptions,
  ) {
    this.client = new SNSClient({
      region: this.options.region,
      credentials: this.options.credentials,
    });
  }

  async send(payload: SmsTransportPayload): Promise<void> {
    await this.client.send(
      new PublishCommand({
        PhoneNumber: payload.to,
        Message: payload.text,
        MessageAttributes: this.options.senderId
          ? {
              'AWS.SNS.SMS.SenderID': {
                DataType: 'String',
                StringValue: this.options.senderId,
              },
            }
          : undefined,
      }),
    );
  }
}
