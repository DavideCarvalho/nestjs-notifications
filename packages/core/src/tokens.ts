/** DI token for the resolved {@link NotificationsModuleOptions}. */
export const NOTIFICATION_OPTIONS = Symbol('NOTIFICATION_OPTIONS');

/** DI token for the active {@link DispatchDriver}. Defaults to the SyncDispatcher. */
export const NOTIFICATION_DISPATCHER = Symbol('NOTIFICATION_DISPATCHER');

/** DI token (multi) under which channel packages register their {@link ChannelDriver}. */
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

/** Optional DI token for a {@link PreferenceGate} consulted before each channel delivery. */
export const NOTIFICATION_PREFERENCE_GATE = Symbol('NOTIFICATION_PREFERENCE_GATE');

/**
 * Optional DI token for a {@link DigestSink}. When a {@link PreferenceGate} returns a `skip`
 * decision carrying a `digest` cadence, the runner forwards the suppressed notification here to
 * be collected into a periodic digest instead of dropping it. Absent (the default), such a skip
 * behaves exactly as before (the channel is dropped). The preferences package binds one.
 */
export const NOTIFICATION_DIGEST_SINK = Symbol('NOTIFICATION_DIGEST_SINK');

/** Optional DI token for the {@link IdempotencyStore} backing dedup. Defaults to in-memory. */
export const NOTIFICATION_IDEMPOTENCY_STORE = Symbol('NOTIFICATION_IDEMPOTENCY_STORE');

/** Optional DI token for the {@link ThrottleStore} backing rate-limiting. Defaults to in-memory. */
export const NOTIFICATION_THROTTLE_STORE = Symbol('NOTIFICATION_THROTTLE_STORE');

/**
 * Optional DI token for a {@link DeliveryConfirmation} probe used by cross-channel fallback chains
 * to decide whether a channel reached the recipient. Absent, the chain uses only the immediate
 * per-channel result (`sent` = delivered).
 */
export const NOTIFICATION_DELIVERY_CONFIRMATION = Symbol('NOTIFICATION_DELIVERY_CONFIRMATION');

/** Optional DI token for a {@link LocaleResolver}. Defaults to {@link PropertyLocaleResolver}. */
export const NOTIFICATION_LOCALE_RESOLVER = Symbol('NOTIFICATION_LOCALE_RESOLVER');

/** Optional DI token for a {@link Translator}. Defaults to an empty {@link InMemoryTranslator}. */
export const NOTIFICATION_TRANSLATOR = Symbol('NOTIFICATION_TRANSLATOR');

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
