/** DI token for the resolved {@link SlackChannelOptions} (webhook url, token, ...). */
export const SLACK_OPTIONS = Symbol('SLACK_OPTIONS');

/** DI token for the optional per-tenant {@link SlackChannelOptions} resolver. */
export const SLACK_OPTIONS_RESOLVER = Symbol('SLACK_OPTIONS_RESOLVER');
