/** DI token for the resolved {@link NotificationsModuleOptions}. */
export const NOTIFICATION_OPTIONS = Symbol('NOTIFICATION_OPTIONS');

/** DI token for the active {@link DispatchDriver}. Defaults to the SyncDispatcher. */
export const NOTIFICATION_DISPATCHER = Symbol('NOTIFICATION_DISPATCHER');

/** DI token (multi) under which channel packages register their {@link ChannelDriver}. */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Optional DI token for a {@link PreferenceGate} consulted before each channel delivery. */
export const NOTIFICATION_PREFERENCE_GATE = Symbol('NOTIFICATION_PREFERENCE_GATE');

/** Event names emitted through `@nestjs/event-emitter`. */
export const NotificationEvents = {
  sending: 'notification.sending',
  sent: 'notification.sent',
  failed: 'notification.failed',
} as const;
