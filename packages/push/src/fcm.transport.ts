import { Inject, Injectable } from '@nestjs/common';
import type * as admin from 'firebase-admin';
import { loadOptionalPeer } from './optional-peer';
import type { PushMessage } from './push-message';
import { FCM_OPTIONS } from './tokens';
import type { BatchSendResult, PushTargetFailure, PushTransport } from './transport';

/** FCM error codes that mean a token is permanently invalid and should be pruned. */
const FCM_DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** FCM caps multicast at 500 tokens per request. */
const FCM_MULTICAST_LIMIT = 500;

/**
 * Options for initializing the Firebase Admin app used by {@link FcmTransport}.
 * Forwarded to `admin.initializeApp`. Supply at least `credential` — typically
 * `admin.credential.cert(serviceAccount)` — or the other supported app options.
 */
export type FcmOptions = admin.AppOptions;

/** Stringify a value the way FCM data payloads require (all values must be strings). */
function toStringRecord(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

/**
 * A {@link PushTransport} backed by Firebase Cloud Messaging (`firebase-admin`).
 *
 * The target is an FCM registration (device) token string. The transport lazily
 * initializes a Firebase Admin app on first use if one is not already initialized.
 *
 * `firebase-admin` is an optional peer, loaded on first send (a missing install throws a clear
 * error then, not at import time).
 */
@Injectable()
export class FcmTransport implements PushTransport {
  private sdk?: Promise<typeof admin>;

  constructor(
    @Inject(FCM_OPTIONS)
    private readonly options: FcmOptions,
  ) {}

  async send(target: unknown, message: PushMessage): Promise<void> {
    const token = String(target);
    await (await this.messaging()).send({ token, ...this.buildPayload(message) });
  }

  /**
   * Multicast to many tokens via FCM's `sendEachForMulticast`, chunked at FCM's 500-token cap.
   * Tokens FCM reports as unregistered/invalid are collected and returned for pruning. A
   * delivery failure for a still-valid token (e.g. a transient FCM error) is not treated as a
   * dead token — it is returned in `failures` instead.
   */
  async sendMany(targets: unknown[], message: PushMessage): Promise<BatchSendResult> {
    const tokens = targets.map((t) => String(t));
    const payload = this.buildPayload(message);
    const invalidTargets: unknown[] = [];
    const failures: PushTargetFailure[] = [];
    const messaging = await this.messaging();

    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const chunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      const response = await messaging.sendEachForMulticast({ tokens: chunk, ...payload });
      response.responses.forEach((res, j) => {
        const code = res.error?.code;
        if (res.success) return;
        if (code && FCM_DEAD_TOKEN_CODES.has(code)) invalidTargets.push(targets[i + j]);
        else
          failures.push({
            target: targets[i + j],
            error: res.error ?? new Error('FCM send failed'),
          });
      });
    }

    return { invalidTargets, failures };
  }

  /** Load `firebase-admin` once, initialize the default app if needed, return its messaging. */
  private async messaging(): Promise<admin.messaging.Messaging> {
    this.sdk ??= loadOptionalPeer<typeof admin>(
      () => import('firebase-admin'),
      'firebase-admin',
      'FcmTransport',
      'initializeApp',
    ).then((sdk) => {
      if (sdk.apps.length === 0) sdk.initializeApp(this.options);
      return sdk;
    });
    return (await this.sdk).messaging();
  }

  /** Build the FCM message body shared by single and multicast sends. */
  private buildPayload(message: PushMessage): Omit<admin.messaging.Message, 'token'> {
    const { title, body, data, icon, url } = message.toObject();
    return {
      notification: { title, body },
      data: toStringRecord(data),
      webpush:
        icon || url
          ? { notification: { icon }, fcmOptions: url ? { link: url } : undefined }
          : undefined,
      android: { notification: { icon } },
    } as Omit<admin.messaging.Message, 'token'>;
  }
}
