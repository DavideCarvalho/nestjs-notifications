/** DI token for the resolved {@link WebhookChannelOptions} (default url, headers). */
export const WEBHOOK_OPTIONS = Symbol('WEBHOOK_OPTIONS');

/** DI token for the optional per-tenant {@link WebhookChannelOptions} resolver. */
export const WEBHOOK_OPTIONS_RESOLVER = Symbol('WEBHOOK_OPTIONS_RESOLVER');
