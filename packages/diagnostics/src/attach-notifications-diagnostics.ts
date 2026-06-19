import {
  NotificationEvents,
  type NotificationFailedEvent,
  type NotificationSendingEvent,
  type NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';
import { emit } from '@dudousxd/nestjs-diagnostics';
import type { EventEmitter2 } from '@nestjs/event-emitter';

type NotificationEvent =
  | NotificationSendingEvent
  | NotificationSentEvent
  | NotificationFailedEvent;

// (core event name) → (diagnostics channel event segment). The `notification.` prefix is dropped so
// the channel reads `aviary:notifications:sent`, not `aviary:notifications:notification.sent`.
const EVENT_MAP = [
  [NotificationEvents.sending, 'sending'],
  [NotificationEvents.sent, 'sent'],
  [NotificationEvents.failed, 'failed'],
] as const;

/**
 * Re-emit the core notification lifecycle events onto the Aviary diagnostics bus as
 * `aviary:notifications:{sending,sent,failed}`. The whole event instance is the payload; the
 * triggering request's `captured.traceId` (from nestjs-context, when present) is propagated onto the
 * diagnostics envelope. Zero-cost per event while no diagnostics subscriber is attached, and never
 * throws back into `@nestjs/event-emitter`. Additive to the telescope / delivery-tracking listeners.
 *
 * @returns an unsubscribe that removes the three listeners.
 */
export function attachNotificationsDiagnostics(emitter: EventEmitter2): () => void {
  const handlers = EVENT_MAP.map(([coreName, channelEvent]) => {
    const handler = (event: NotificationEvent): void => {
      const traceId = event.captured?.traceId;
      emit('notifications', channelEvent, event, traceId !== undefined ? { traceId } : undefined);
    };
    emitter.on(coreName, handler);
    return [coreName, handler] as const;
  });

  return () => {
    for (const [coreName, handler] of handlers) emitter.off(coreName, handler);
  };
}
