import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';

/** DI token for an optional {@link ReadSyncPublisher}. Absent → no cross-device read sync. */
export const READ_SYNC_PUBLISHER = Symbol('READ_SYNC_PUBLISHER');

/**
 * A cross-device read/seen event: one notification (or all) was read for a notifiable. Broadcast
 * over the realtime backplane (e.g. SSE) so a user's OTHER open devices update their inbox without
 * a refetch. Modelled after Knock/Novu in-app "read" sync.
 */
export interface ReadEvent {
  /** The notifiable whose inbox changed (so the publisher can route to the right stream). */
  ref: NotifiableRef;
  /** Tenant scope, when multi-tenant. */
  tenantId?: string | undefined;
  /** The notification id marked read, or `null` for a "mark all read" event. */
  notificationId: string | null;
  /** When it was read (ISO string, JSON-safe across the backplane). */
  readAt: string;
}

/**
 * Publishes {@link ReadEvent}s so a user's other devices update. Bind an implementation under
 * {@link READ_SYNC_PUBLISHER} (the SSE package provides one); absent, read sync is a no-op and the
 * query service behaves exactly as before.
 */
export interface ReadSyncPublisher {
  publishRead(event: ReadEvent): void | Promise<void>;
}
