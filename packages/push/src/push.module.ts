import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import type { ExpoOptions } from './expo.transport';
import type { FcmOptions } from './fcm.transport';
import { PushChannel } from './push.channel';
import { EXPO_OPTIONS, FCM_OPTIONS, PUSH_TRANSPORT, WEB_PUSH_OPTIONS } from './tokens';
import type { PushTransport } from './transport';
import type { WebPushOptions } from './web-push.transport';

export interface PushChannelModuleOptions {
  /**
   * The transport class to deliver push notifications with. Pick exactly ONE of the
   * built-in transports — {@link WebPushTransport}, {@link FcmTransport}, or
   * {@link ExpoTransport} (or your own) — and supply its matching options below.
   */
  transport: Type<PushTransport>;
  /** VAPID options. Supply when using {@link WebPushTransport}. */
  webPush?: WebPushOptions;
  /** Firebase Admin app options. Supply when using {@link FcmTransport}. */
  fcm?: FcmOptions;
  /** Expo client options. Supply when using {@link ExpoTransport}. */
  expo?: ExpoOptions;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the push channel with a single transport.
 *
 * Pick ONE transport and provide its matching options:
 *
 * ```ts
 * // Web Push (VAPID)
 * PushChannelModule.forRoot({
 *   transport: WebPushTransport,
 *   webPush: { publicKey, privateKey, subject: 'mailto:ops@example.com' },
 * });
 *
 * // Firebase Cloud Messaging
 * PushChannelModule.forRoot({
 *   transport: FcmTransport,
 *   fcm: { credential: admin.credential.cert(serviceAccount) },
 * });
 *
 * // Expo
 * PushChannelModule.forRoot({
 *   transport: ExpoTransport,
 *   expo: { accessToken: process.env.EXPO_ACCESS_TOKEN },
 * });
 * ```
 */
@Module({})
export class PushChannelModule {
  static forRoot(options: PushChannelModuleOptions): DynamicModule {
    const transportClass = options.transport;

    const providers: Provider[] = [
      { provide: WEB_PUSH_OPTIONS, useValue: options.webPush ?? {} },
      { provide: FCM_OPTIONS, useValue: options.fcm ?? {} },
      { provide: EXPO_OPTIONS, useValue: options.expo ?? {} },
      transportClass,
      { provide: PUSH_TRANSPORT, useExisting: transportClass },
      PushChannel,
    ];

    return {
      module: PushChannelModule,
      global: options.global ?? true,
      providers,
      exports: [PushChannel],
    };
  }
}
