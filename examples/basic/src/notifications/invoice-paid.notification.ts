import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import type { DatabaseNotification } from '@dudousxd/nestjs-notifications-database';
import { MailMessage, type MailNotification } from '@dudousxd/nestjs-notifications-mail';

/**
 * Sent when an invoice is paid. Goes out over both the mail and database channels —
 * a single class defines the payload for each.
 */
export class InvoicePaid implements Notification, MailNotification, DatabaseNotification {
  constructor(
    public readonly invoiceId: string,
    public readonly amount: number,
  ) {}

  via(): string[] {
    return ['mail', 'database'];
  }

  toMail(notifiable: Notifiable): MailMessage {
    void notifiable;
    return new MailMessage()
      .subject(`Invoice ${this.invoiceId} paid`)
      .greeting('Thanks for your payment!')
      .line(`We received your payment of $${this.amount.toFixed(2)}.`)
      .action('View invoice', `https://example.com/invoices/${this.invoiceId}`)
      .line('No further action is needed.');
  }

  toDatabase(): Record<string, unknown> {
    return { invoiceId: this.invoiceId, amount: this.amount };
  }
}
