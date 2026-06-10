import { Notification } from '@dudousxd/nestjs-notifications-core';
import { Database } from '@dudousxd/nestjs-notifications-database';
import { Mail, MailMessage } from '@dudousxd/nestjs-notifications-mail';

/**
 * Sent when an invoice is paid. Goes out over both the mail and database channels —
 * a single class defines the payload for each. The channels are inferred from the
 * `@Mail()` / `@Database()` decorators, so there's no `via()` to keep in sync.
 */
@Notification()
export class InvoicePaid {
  constructor(
    public readonly invoiceId: string,
    public readonly amount: number,
  ) {}

  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject(`Invoice ${this.invoiceId} paid`)
      .greeting('Thanks for your payment!')
      .line(`We received your payment of $${this.amount.toFixed(2)}.`)
      .action('View invoice', `https://example.com/invoices/${this.invoiceId}`)
      .line('No further action is needed.');
  }

  @Database()
  toDatabase(): Record<string, unknown> {
    return { invoiceId: this.invoiceId, amount: this.amount };
  }
}
