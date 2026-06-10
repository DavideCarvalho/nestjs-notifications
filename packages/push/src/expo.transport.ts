import { Inject, Injectable } from '@nestjs/common';
import { Expo } from 'expo-server-sdk';
import type { PushMessage } from './push-message';
import { EXPO_OPTIONS } from './tokens';
import type { PushTransport } from './transport';

/** Options forwarded to the `expo-server-sdk` client constructor. */
export interface ExpoOptions {
  /** Expo access token, required for higher rate limits / FCM v1. */
  accessToken?: string;
  /** Use the deprecated FCM legacy API path. */
  useFcmV1?: boolean;
  [key: string]: unknown;
}

/**
 * A {@link PushTransport} backed by Expo's push service (`expo-server-sdk`).
 *
 * The target is an Expo push token string (e.g. `ExponentPushToken[...]`).
 */
@Injectable()
export class ExpoTransport implements PushTransport {
  private readonly expo: Expo;

  constructor(
    @Inject(EXPO_OPTIONS)
    private readonly options: ExpoOptions,
  ) {
    this.expo = new Expo(this.options);
  }

  async send(target: unknown, message: PushMessage): Promise<void> {
    const to = String(target);
    const { title, body, data } = message.toObject();

    await this.expo.sendPushNotificationsAsync([{ to, title, body, data }]);
  }
}
