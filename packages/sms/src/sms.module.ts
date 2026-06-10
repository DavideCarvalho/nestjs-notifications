import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { SmsChannel, type SmsChannelOptions } from './sms.channel';
import { SMS_OPTIONS, SMS_TRANSPORT, SMS_TWILIO_OPTIONS } from './tokens';
import { type SmsTransport, type TwilioOptions, TwilioTransport } from './transport';

export interface SmsChannelModuleOptions {
  /** Default sender number for messages that don't set their own. */
  from?: string;
  /** Custom transport class. Defaults to {@link TwilioTransport}. */
  transport?: Type<SmsTransport>;
  /** Twilio credentials for the default transport. */
  twilio?: TwilioOptions;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the sms channel.
 *
 * ```ts
 * SmsChannelModule.forRoot({
 *   from: '+15555550100',
 *   twilio: { accountSid: 'AC...', authToken: '...' },
 * });
 * ```
 */
@Module({})
export class SmsChannelModule {
  static forRoot(options: SmsChannelModuleOptions = {}): DynamicModule {
    const smsOptions: SmsChannelOptions = { from: options.from };
    const transportClass = options.transport ?? TwilioTransport;

    const providers: Provider[] = [
      { provide: SMS_OPTIONS, useValue: smsOptions },
      { provide: SMS_TWILIO_OPTIONS, useValue: options.twilio ?? {} },
      transportClass,
      { provide: SMS_TRANSPORT, useExisting: transportClass },
      SmsChannel,
    ];

    return {
      module: SmsChannelModule,
      global: options.global ?? true,
      providers,
      exports: [SmsChannel],
    };
  }
}
