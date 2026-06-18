import { Inject, Injectable, Optional } from '@nestjs/common';
import { sseKey } from './sse-key';
import type { SseChannelOptions } from './sse.channel';
import { SseHub } from './sse.hub';
import { SSE_OPTIONS } from './tokens';

/**
 * A cross-device read/seen event. Structurally compatible with the database package's
 * `ReadSyncPublisher`/`ReadEvent` contract (kept local so SSE does not depend on database).
 */
export interface ReadSyncEvent {
  ref: { type: string; id: string | number };
  tenantId?: string;
  /** The notification id marked read, or `null` for "mark all read". */
  notificationId: string | null;
  readAt: string;
}

/** SSE event name carrying read-sync payloads. Distinct from the `notification` push event. */
export const SSE_READ_EVENT = 'read';

/**
 * Broadcasts read/seen events over the {@link SseHub} (and thus the SSE backplane, so other pods
 * reach the user's connections) under the SAME stream key the {@link SseChannel} publishes to —
 * `sseKey(tenant, notifiableId)`. The client reads these as `event: read` frames and updates the
 * inbox on the user's other devices without a refetch.
 *
 * Bind it under the database package's `READ_SYNC_PUBLISHER` token (it is structurally a
 * `ReadSyncPublisher`) so `markAsRead`/`markAllAsRead` fan out cross-device.
 */
@Injectable()
export class SseReadSyncPublisher {
  constructor(
    private readonly hub: SseHub,
    @Optional()
    @Inject(SSE_OPTIONS)
    private readonly options?: SseChannelOptions,
  ) {}

  publishRead(event: ReadSyncEvent): void {
    const key = sseKey(event.tenantId, String(event.ref.id));
    this.hub.publish(
      key,
      { notificationId: event.notificationId, readAt: event.readAt },
      { event: SSE_READ_EVENT },
    );
  }
}
