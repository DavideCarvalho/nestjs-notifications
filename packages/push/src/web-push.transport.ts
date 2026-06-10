import { Inject, Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
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
 */
@Injectable()
export class WebPushTransport implements PushTransport {
  constructor(
    @Inject(WEB_PUSH_OPTIONS)
    private readonly options: WebPushOptions,
  ) {
    webpush.setVapidDetails(this.options.subject, this.options.publicKey, this.options.privateKey);
  }

  async send(target: unknown, message: PushMessage): Promise<void> {
    const subscription = target as webpush.PushSubscription;
    const { title, body, data, icon, url } = message.toObject();

    await webpush.sendNotification(subscription, JSON.stringify({ title, body, data, icon, url }));
  }
}
