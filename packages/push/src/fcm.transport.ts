import { Inject, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { PushMessage } from './push-message';
import { FCM_OPTIONS } from './tokens';
import type { PushTransport } from './transport';

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
 */
@Injectable()
export class FcmTransport implements PushTransport {
  constructor(
    @Inject(FCM_OPTIONS)
    private readonly options: FcmOptions,
  ) {
    if (admin.apps.length === 0) {
      admin.initializeApp(this.options);
    }
  }

  async send(target: unknown, message: PushMessage): Promise<void> {
    const token = String(target);
    const { title, body, data, icon, url } = message.toObject();

    await admin.messaging().send({
      token,
      notification: { title, body },
      data: toStringRecord(data),
      webpush:
        icon || url
          ? { notification: { icon }, fcmOptions: url ? { link: url } : undefined }
          : undefined,
      android: { notification: { icon } },
    });
  }
}
