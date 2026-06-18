import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import type { ApnsOptions } from './apns.transport';
import type { ExpoOptions } from './expo.transport';
import type { FcmOptions } from './fcm.transport';
import { PushChannel, type PushTransportResolver } from './push.channel';
import {
  APNS_OPTIONS,
  EXPO_OPTIONS,
  FCM_OPTIONS,
  PUSH_INVALID_TOKEN_CALLBACK,
  PUSH_TRANSPORT,
  PUSH_TRANSPORT_RESOLVER,
  WEB_PUSH_OPTIONS,
} from './tokens';
import type { InvalidTokenCallback, PushTransport } from './transport';
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
  /** APNs provider options. Supply when using {@link ApnsTransport}. */
  apns?: ApnsOptions;
  /**
   * Optional per-tenant transport resolver. When a notification is delivered with a
   * `context.tenant`, the returned transport is used instead of the default one.
   */
  resolveTransport?: PushTransportResolver;
  /**
   * Invoked after a batch send with the device tokens the provider rejected as permanently
   * invalid (FCM `UNREGISTERED`, Expo `DeviceNotRegistered`). Use it to prune dead tokens from
   * your store. Only fires for transports that support multicast ({@link FcmTransport},
   * {@link ExpoTransport}).
   */
  onInvalidTokens?: InvalidTokenCallback;
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
 *
 * // Apple Push Notification service (token-based auth via .p8 key)
 * PushChannelModule.forRoot({
 *   transport: ApnsTransport,
 *   apns: {
 *     token: { key: './AuthKey_ABC123.p8', keyId: 'ABC123', teamId: 'TEAM456' },
 *     topic: 'com.example.app',
 *     production: true,
 *   },
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
      { provide: APNS_OPTIONS, useValue: options.apns ?? {} },
      transportClass,
      { provide: PUSH_TRANSPORT, useExisting: transportClass },
      { provide: PUSH_TRANSPORT_RESOLVER, useValue: options.resolveTransport ?? null },
      { provide: PUSH_INVALID_TOKEN_CALLBACK, useValue: options.onInvalidTokens ?? null },
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
