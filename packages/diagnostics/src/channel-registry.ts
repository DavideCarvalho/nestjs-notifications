import type {
  NotificationFailedEvent,
  NotificationSendingEvent,
  NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';

// Declaration-merge notifications' three lifecycle channels into the diagnostics ChannelRegistry so
// `@OnDiagnostic('notifications', 'failed')`, `getChannel('notifications', 'failed')`, and
// `emit('notifications', 'failed', …)` all infer the matching event-class payload. Purely additive.
declare module '@dudousxd/nestjs-diagnostics' {
  interface ChannelRegistry {
    notifications: {
      sending: NotificationSendingEvent;
      sent: NotificationSentEvent;
      failed: NotificationFailedEvent;
    };
  }
}
