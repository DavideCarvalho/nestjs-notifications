/** DI token for the resolved {@link SmsChannelOptions} (default `from`, etc.). */
export const SMS_OPTIONS = Symbol('SMS_OPTIONS');

/** DI token for the {@link SmsTransport} implementation that actually delivers the SMS. */
export const SMS_TRANSPORT = Symbol('SMS_TRANSPORT');

/** DI token for the Twilio options handed to the {@link TwilioTransport}. */
export const SMS_TWILIO_OPTIONS = Symbol('SMS_TWILIO_OPTIONS');

/** DI token for the Vonage options handed to the {@link VonageTransport}. */
export const SMS_VONAGE_OPTIONS = Symbol('SMS_VONAGE_OPTIONS');

/** DI token for the AWS SNS options handed to the {@link SnsTransport}. */
export const SMS_SNS_OPTIONS = Symbol('SMS_SNS_OPTIONS');

/** DI token for the optional per-tenant {@link SmsTransport} resolver. */
export const SMS_TRANSPORT_RESOLVER = Symbol('SMS_TRANSPORT_RESOLVER');
