import {
  type DigestSink,
  type Notifiable,
  type Notification,
  NotificationSerializer,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import type { DigestCadence, PendingDigestStore } from './digest.interfaces';
import { PENDING_DIGEST_STORE } from './tokens';

/**
 * Core {@link DigestSink} implementation. When the {@link PreferenceCenterGate} returns a `skip`
 * carrying a `daily`/`weekly` cadence, the ChannelRunner forwards the suppressed notification
 * here; this adapter serializes the notifiable + notification and enqueues a
 * {@link PendingDigestEntry} into the {@link PendingDigestStore} for the
 * {@link DigestCollector} to flush later. Bound to the core `NOTIFICATION_DIGEST_SINK` token by
 * {@link PreferencesModule.forDigest}.
 */
@Injectable()
export class DigestSinkAdapter implements DigestSink {
  constructor(
    @Inject(PENDING_DIGEST_STORE) private readonly store: PendingDigestStore,
    private readonly serializer: NotificationSerializer,
  ) {}

  async collect(entry: {
    notifiable: Notifiable;
    notification: Notification;
    channel: string;
    cadence: DigestCadence;
    category: string;
    tenant?: string;
  }): Promise<void> {
    const notifiable = this.serializer.serializeNotifiable(entry.notifiable);
    const notification = this.serializer.serializeNotification(entry.notification);
    await this.store.enqueue({
      notifiable,
      tenantId: entry.tenant ?? null,
      category: entry.category,
      cadence: entry.cadence,
      notification,
    });
  }
}
