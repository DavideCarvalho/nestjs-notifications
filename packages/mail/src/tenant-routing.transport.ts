import {
  type MailMessage,
  MailTransport,
  type MailTransportResult,
  type MailTransportSendOptions,
} from '@nestjs/mail';
import { currentMailScope } from './mail-scope';

/**
 * A `@nestjs/mail` transport that picks the tenant's transport per message: the tenant comes from
 * the mail scope the channel runs every notification in (an `AsyncLocalStorage`, never a
 * header on the message). Mail without a tenant goes through `fallback`.
 *
 * ```ts
 * MailModule.forRoot({
 *   transport: new TenantRoutingMailTransport(
 *     (tenant) => tenantTransports.get(tenant),   // undefined → fallback
 *     new SmtpTransport({ host: 'smtp.example.com' }),
 *   ),
 * });
 * ```
 *
 * `close()` closes `fallback`; the resolver owns the tenants' transports.
 */
export class TenantRoutingMailTransport extends MailTransport {
  constructor(
    private readonly resolve: (tenant: string) => MailTransport | undefined,
    private readonly fallback: MailTransport,
  ) {
    super();
  }

  send(message: MailMessage, options: MailTransportSendOptions): Promise<MailTransportResult> {
    const tenant = currentMailScope()?.tenant;
    const transport = (tenant !== undefined ? this.resolve(tenant) : undefined) ?? this.fallback;
    return transport.send(message, options);
  }

  async close(): Promise<void> {
    await this.fallback.close?.();
  }
}
