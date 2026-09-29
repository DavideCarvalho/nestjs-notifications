import { Inject, Injectable } from '@nestjs/common';
import type { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { loadOptionalPeer } from './optional-peer';
import type { PushMessage } from './push-message';
import { EXPO_OPTIONS } from './tokens';
import type { BatchSendResult, PushTargetFailure, PushTransport } from './transport';

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
 *
 * `expo-server-sdk` is an optional peer, loaded on first send (a missing install throws a clear
 * error then, not at import time).
 */
@Injectable()
export class ExpoTransport implements PushTransport {
  private client?: Promise<{ expo: Expo; Expo: typeof Expo }>;

  constructor(
    @Inject(EXPO_OPTIONS)
    private readonly options: ExpoOptions,
  ) {}

  /** Load `expo-server-sdk` once and build the client. */
  private sdk(): Promise<{ expo: Expo; Expo: typeof Expo }> {
    this.client ??= loadOptionalPeer<{ Expo: typeof Expo }>(
      () => import('expo-server-sdk'),
      'expo-server-sdk',
      'ExpoTransport',
      'Expo',
    ).then(({ Expo: ExpoClass }) => ({ expo: new ExpoClass(this.options), Expo: ExpoClass }));
    return this.client;
  }

  async send(target: unknown, message: PushMessage): Promise<void> {
    const to = String(target);
    // `toObject()` already omits absent fields, so spreading keeps `title`/`body`/`data` out of the
    // message entirely when unset (exactOptionalPropertyTypes) rather than passing explicit undefined.
    const { title, body, data } = message.toObject();
    const { expo } = await this.sdk();

    await expo.sendPushNotificationsAsync([
      {
        to,
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(data !== undefined ? { data } : {}),
      },
    ]);
  }

  /**
   * Batch delivery to many Expo tokens, chunked with the SDK's own `chunkPushNotifications`.
   * Tickets that come back with `DeviceNotRegistered` map to permanently-invalid tokens, which
   * are collected and returned for pruning. (Malformed tokens are also dropped from the request
   * by the SDK and reported as invalid here.) Other ticket errors (e.g. `MessageRateExceeded`) are
   * returned in `failures`.
   */
  async sendMany(targets: unknown[], message: PushMessage): Promise<BatchSendResult> {
    const { title, body, data } = message.toObject();
    const invalidTargets: unknown[] = [];
    const failures: PushTargetFailure[] = [];
    const { expo, Expo } = await this.sdk();

    // The SDK only accepts well-formed Expo tokens; anything else is already a dead token.
    const valid: { target: unknown; to: string }[] = [];
    for (const target of targets) {
      const to = String(target);
      if (Expo.isExpoPushToken(to)) valid.push({ target, to });
      else invalidTargets.push(target);
    }

    const messages: ExpoPushMessage[] = valid.map(({ to }) => ({
      to,
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(data !== undefined ? { data } : {}),
    }));
    const chunks = expo.chunkPushNotifications(messages);

    let cursor = 0;
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, j) => {
        const source = valid[cursor + j];
        if (!source || ticket.status !== 'error') return;
        if (ticket.details?.error === 'DeviceNotRegistered') invalidTargets.push(source.target);
        else
          failures.push({
            target: source.target,
            error: new Error(ticket.message ?? ticket.details?.error ?? 'Expo push failed'),
          });
      });
      cursor += chunk.length;
    }

    return { invalidTargets, failures };
  }
}
