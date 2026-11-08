/** The outbox topic notification jobs are written to. */
export const NOTIFICATIONS_OUTBOX_TOPIC = 'aviary.notifications';

/** The `@OnOutboxMessage()` consumer name (its inbox identity). Keep it stable. */
export const NOTIFICATIONS_OUTBOX_CONSUMER = 'aviary.notifications';

/** DI token for the {@link OutboxDispatcherOptions}. */
export const NOTIFICATIONS_OUTBOX_OPTIONS = Symbol('NOTIFICATIONS_OUTBOX_OPTIONS');
