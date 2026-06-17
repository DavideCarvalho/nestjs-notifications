/** DI token for the resolved {@link NotificationsModuleOptions}. */
export const NOTIFICATION_OPTIONS = Symbol('NOTIFICATION_OPTIONS');

/** DI token for the active {@link DispatchDriver}. Defaults to the SyncDispatcher. */
export const NOTIFICATION_DISPATCHER = Symbol('NOTIFICATION_DISPATCHER');

/** DI token (multi) under which channel packages register their {@link ChannelDriver}. */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Optional DI token for a {@link PreferenceGate} consulted before each channel delivery. */
export const NOTIFICATION_PREFERENCE_GATE = Symbol('NOTIFICATION_PREFERENCE_GATE');

/**
 * Cross-lib injection token for the current-request context accessor, owned by
 * `@dudousxd/nestjs-context`. We do NOT import nestjs-context — instead we share its
 * well-known token by value so DI resolves the same provider when present.
 *
 * `Symbol.for(key)` uses the global symbol registry, so this resolves to the SAME symbol
 * instance as nestjs-context's `tokens.ts` without any import. The key MUST stay
 * byte-identical with nestjs-context's export. Consulted with `@Optional()` — absent, the
 * notification path is unchanged (no captured causer/tenant/trace).
 */
export const CONTEXT_ACCESSOR = Symbol.for('@dudousxd/nestjs-context:accessor');

/** Event names emitted through `@nestjs/event-emitter`. */
export const NotificationEvents = {
  sending: 'notification.sending',
  sent: 'notification.sent',
  failed: 'notification.failed',
} as const;
