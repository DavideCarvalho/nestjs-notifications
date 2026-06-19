import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { SmsChannel, type SmsChannelOptions, type SmsTransportResolver } from './sms.channel';
import type { SnsOptions } from './sns.transport';
import {
  SMS_OPTIONS,
  SMS_SNS_OPTIONS,
  SMS_TRANSPORT,
  SMS_TRANSPORT_RESOLVER,
  SMS_TWILIO_OPTIONS,
  SMS_VONAGE_OPTIONS,
} from './tokens';
import { type SmsTransport, type TwilioOptions, TwilioTransport } from './transport';
import type { VonageOptions } from './vonage.transport';

export interface SmsChannelModuleOptions {
  /** Default sender number for messages that don't set their own. */
  from?: string;
  /** Custom transport class. Defaults to {@link TwilioTransport}. */
  transport?: Type<SmsTransport>;
  /**
   * A pre-built transport instance, taking precedence over `transport`. Use it when the transport
   * needs constructor arguments — e.g. a resilientTransport() from @dudousxd/nestjs-notifications-resilience.
   */
  transportInstance?: SmsTransport;
  /** Twilio credentials for the default transport. */
  twilio?: TwilioOptions;
  /** Vonage credentials. Supply when using {@link VonageTransport}. */
  vonage?: VonageOptions;
  /** AWS SNS options. Supply when using {@link SnsTransport}. */
  sns?: SnsOptions;
  /**
   * Optional per-tenant transport resolver. When a notification is delivered with a
   * `context.tenant`, the returned transport is used instead of the default one.
   */
  resolveTransport?: SmsTransportResolver;
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
 *
 * // Vonage
 * SmsChannelModule.forRoot({
 *   transport: VonageTransport,
 *   vonage: { apiKey: '...', apiSecret: '...', from: 'Acme' },
 * });
 *
 * // AWS SNS
 * SmsChannelModule.forRoot({
 *   transport: SnsTransport,
 *   sns: { region: 'us-east-1', senderId: 'Acme' },
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
      { provide: SMS_VONAGE_OPTIONS, useValue: options.vonage ?? {} },
      { provide: SMS_SNS_OPTIONS, useValue: options.sns ?? {} },
      { provide: SMS_TRANSPORT_RESOLVER, useValue: options.resolveTransport ?? null },
      SmsChannel,
    ];

    if (options.transportInstance) {
      providers.push({ provide: SMS_TRANSPORT, useValue: options.transportInstance });
    } else {
      providers.push(transportClass, { provide: SMS_TRANSPORT, useExisting: transportClass });
    }

    return {
      module: SmsChannelModule,
      global: options.global ?? true,
      providers,
      exports: [SmsChannel],
    };
  }
}
