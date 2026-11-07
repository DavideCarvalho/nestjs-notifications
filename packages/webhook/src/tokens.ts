/** DI token for the resolved {@link WebhookChannelOptions}. */
export const WEBHOOK_OPTIONS = Symbol('WEBHOOK_OPTIONS');

/** DI token for the optional per-tenant {@link WebhookChannelOptions} resolver. */
export const WEBHOOK_OPTIONS_RESOLVER = Symbol('WEBHOOK_OPTIONS_RESOLVER');

/** DI token for the transaction opener used by subscription delivery. */
export const WEBHOOK_TRANSACTION = Symbol('WEBHOOK_TRANSACTION');
