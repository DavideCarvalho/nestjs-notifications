/** DI token for the resolved {@link MailChannelOptions} (default `from`, etc.). */
export const MAIL_OPTIONS = Symbol('MAIL_OPTIONS');

/** DI token for the {@link MailTransport} implementation that actually delivers mail. */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** DI token for the {@link MailRenderer} that turns a {@link MailMessage} into html/text. */
export const MAIL_RENDERER = Symbol('MAIL_RENDERER');

/** DI token for the SMTP options handed to the {@link NodemailerTransport}. */
export const MAIL_SMTP_OPTIONS = Symbol('MAIL_SMTP_OPTIONS');

/** DI token for the optional per-tenant transport resolver. */
export const MAIL_TRANSPORT_RESOLVER = Symbol('MAIL_TRANSPORT_RESOLVER');
