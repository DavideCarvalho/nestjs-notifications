import { NotificationService } from '@dudousxd/nestjs-notifications-core';
import { InMemoryStore } from '@dudousxd/nestjs-notifications-database';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { NotificationsInboxController } from './notifications/inbox.controller';
import { InvoicePaid } from './notifications/invoice-paid.notification';
import { User } from './user';

describe('basic example (e2e)', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
  });

  it('fans a single notification out to the mail and database channels', async () => {
    const notifications = moduleRef.get(NotificationService);
    const mail = moduleRef.get(MailTransport) as InMemoryMailTransport;
    const store = moduleRef.get(InMemoryStore);
    const user = new User(1, 'ada@example.com');

    await notifications.send(user, new InvoicePaid('INV-1', 42));

    // Mail channel rendered and delivered the message.
    expect(mail.mails).toHaveLength(1);
    const sent = mail.assertSent({ to: 'ada@example.com' });
    expect(sent.subject).toBe('Invoice INV-1 paid');
    expect(sent.html).toContain('INV-1');

    // Database channel persisted it for in-app display.
    const stored = await store.getForNotifiable('User', '1');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('InvoicePaid');
    expect(stored[0]?.data).toEqual({ invoiceId: 'INV-1', amount: 42 });
    expect(stored[0]?.readAt).toBeNull();
  });

  it('the inbox answers like the library: filter[type] on unread, 400 on bad or removed params', async () => {
    const notifications = moduleRef.get(NotificationService);
    const inbox = moduleRef.get(NotificationsInboxController);
    await notifications.send(new User(1, 'ada@example.com'), new InvoicePaid('INV-1', 42));

    expect((await inbox.unread({ 'filter[type]': 'InvoicePaid' })).data).toHaveLength(1);
    expect((await inbox.unread({ 'filter[type]': 'Other' })).data).toHaveLength(0);
    expect((await inbox.unreadCount({ 'filter[type]': 'Other' })).count).toBe(0);
    expect((await inbox.list({ page: 1, size: 5 })).meta.perPage).toBe(5);

    const bad: Record<string, unknown>[] = [
      { page: '0' },
      { size: 'abc' },
      { sort: 'createdAt' },
      { 'filter[read]': 'true' },
      { perPage: '5' },
      { type: 'InvoicePaid' },
    ];
    for (const query of bad) {
      await expect(inbox.list(query as never)).rejects.toMatchObject({ status: 400 });
    }
    await expect(inbox.unread({ type: 'A' } as never)).rejects.toMatchObject({ status: 400 });
  });
});
