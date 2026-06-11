import { Inject, Injectable } from '@nestjs/common';
import apn from '@parse/node-apn';
import type { PushMessage } from './push-message';
import { APNS_OPTIONS } from './tokens';
import type { PushTransport } from './transport';

/**
 * Options for initializing the APNs provider used by {@link ApnsTransport}.
 *
 * Token-based auth (a `.p8` signing key) is the primary path; supply `token`.
 * Certificate auth is also supported via `cert`/`key` for legacy setups.
 */
export interface ApnsOptions {
  /** Token-based authentication using an APNs `.p8` signing key. */
  token?: {
    /** The `.p8` key — a file path or the key contents as a string/Buffer. */
    key: string;
    /** The 10-character Key ID of the `.p8` key. */
    keyId: string;
    /** The 10-character Apple Developer Team ID. */
    teamId: string;
  };
  /** Certificate-based authentication: the client certificate (path or contents). */
  cert?: string;
  /** Certificate-based authentication: the certificate key (path or contents). */
  key?: string;
  /** Use the production APNs gateway instead of sandbox. Default false. */
  production?: boolean;
  /** Default topic (usually the app bundle id) for notifications that don't set one. */
  topic?: string;
}

/**
 * The target an APNs notification is delivered to: either the device token string
 * directly, or an object carrying the token and an optional per-message topic.
 */
type ApnsTarget = string | { deviceToken: string; topic?: string };

/** The shape of `apn.Notification` fields we set, narrowed for type-safety. */
interface ApnsNotification {
  alert?: { title?: string; body?: string };
  payload?: Record<string, unknown>;
  topic?: string;
  sound?: string;
}

/** Narrow the raw `target` into a device token plus optional topic. */
function resolveTarget(target: unknown): { deviceToken: string; topic?: string } {
  if (typeof target === 'string') return { deviceToken: target };
  const obj = target as { deviceToken: string; topic?: string };
  return { deviceToken: String(obj.deviceToken), topic: obj.topic };
}

/**
 * A {@link PushTransport} backed by Apple Push Notification service (`@parse/node-apn`).
 *
 * The target is an APNs device token string (or `{ deviceToken, topic }`). The
 * provider is constructed lazily from the injected {@link ApnsOptions}.
 */
@Injectable()
export class ApnsTransport implements PushTransport {
  private readonly provider: apn.Provider;

  constructor(
    @Inject(APNS_OPTIONS)
    private readonly options: ApnsOptions,
  ) {
    this.provider = new apn.Provider({
      token: this.options.token,
      cert: this.options.cert,
      key: this.options.key,
      production: this.options.production,
    } as apn.ProviderOptions);
  }

  async send(target: unknown, message: PushMessage): Promise<void> {
    const { deviceToken, topic } = resolveTarget(target);
    const { title, body, data, url } = message.toObject();

    const notification = new apn.Notification() as unknown as ApnsNotification;
    notification.alert = { title, body };
    notification.payload = { ...(data ?? {}), ...(url ? { url } : {}) };
    notification.topic = topic ?? this.options.topic ?? '';
    notification.sound = 'default';

    const result = await this.provider.send(
      notification as unknown as apn.Notification,
      deviceToken,
    );

    if (result.failed.length > 0) {
      const reasons = result.failed
        .map((f) => f.response?.reason ?? f.error?.message ?? 'unknown')
        .join(', ');
      throw new Error(`APNs delivery failed: ${reasons}`);
    }
  }
}
