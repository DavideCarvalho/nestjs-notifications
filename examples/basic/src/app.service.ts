import { NotificationService } from '@nestjs-notifications/core';
import { Injectable } from '@nestjs/common';
import { InvoicePaid } from './notifications/invoice-paid.notification';
import type { User } from './user';

@Injectable()
export class AppService {
  constructor(private readonly notifications: NotificationService) {}

  /** Notify a user that their invoice was paid — fans out to mail + database. */
  async invoiceWasPaid(user: User, invoiceId: string, amount: number): Promise<void> {
    await this.notifications.send(user, new InvoicePaid(invoiceId, amount));
  }
}
