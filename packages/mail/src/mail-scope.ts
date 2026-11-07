import { AsyncLocalStorage } from 'node:async_hooks';

/** What the mail channel knows about the send in progress. */
export interface MailScope {
  /** The tenant the notification is delivered for, when multi-tenant. */
  tenant?: string | undefined;
  /** The notification's name, when the mail is a notification delivery. */
  notification?: string | undefined;
}

const storage = new AsyncLocalStorage<MailScope>();

/**
 * The scope of the mail being sent, read inside `@nestjs/mail`'s send path: by a transport
 * (`TenantRoutingMailTransport`) or a `MailEvents` subscriber. `undefined` for mail the app sends
 * with `Mailer` directly, outside {@link runInMailScope}.
 */
export function currentMailScope(): MailScope | undefined {
  return storage.getStore();
}

/**
 * Run `fn` (a `mailer.send(...)`) in a mail scope. The mail channel does this for every
 * notification; call it yourself to route a direct `Mailer` send through a tenant's transport.
 */
export function runInMailScope<R>(scope: MailScope, fn: () => R): R {
  return storage.run(scope, fn);
}
