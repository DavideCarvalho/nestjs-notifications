import { Inject, Injectable } from '@nestjs/common';
import type * as WebPush from 'web-push';
import { loadOptionalPeer } from './optional-peer';
import type { PushMessage } from './push-message';
import { WEB_PUSH_OPTIONS } from './tokens';
import type { PushTransport } from './transport';

/** VAPID configuration for the Web Push protocol. */
export interface WebPushOptions {
  /** VAPID public key. */
  publicKey: string;
  /** VAPID private key. */
  privateKey: string;
  /** VAPID subject: a `mailto:` address or your site URL. */
  subject: string;
}

/**
 * A {@link PushTransport} backed by the Web Push protocol (`web-push`).
 *
 * The target is a `PushSubscription` object (as produced in the browser by
 * `PushManager.subscribe()` and persisted server-side).
 *
 * `web-push` is an optional peer, loaded on first send (a missing install throws a clear error
 * then, not at import time).
 */
@Injectable()
export class WebPushTransport implements PushTransport {
  private client?: Promise<typeof WebPush>;

  constructor(
    @Inject(WEB_PUSH_OPTIONS)
    private readonly options: WebPushOptions,
  ) {}

  async send(target: unknown, message: PushMessage): Promise<void> {
    const webpush = await this.webpush();
    const subscription = target as WebPush.PushSubscription;
    const { title, body, data, icon, url } = message.toObject();

    await webpush.sendNotification(subscription, JSON.stringify({ title, body, data, icon, url }));
  }

  /** Load `web-push` once and apply the VAPID details. */
  private webpush(): Promise<typeof WebPush> {
    this.client ??= loadOptionalPeer<typeof WebPush>(
      () => import('web-push'),
      'web-push',
      'WebPushTransport',
      'sendNotification',
    ).then((webpush) => {
      webpush.setVapidDetails(
        this.options.subject,
        this.options.publicKey,
        this.options.privateKey,
      );
      return webpush;
    });
    return this.client;
  }
}
