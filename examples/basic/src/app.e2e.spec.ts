import { NotificationService } from '@nestjs-notifications/core';
import { InMemoryStore } from '@nestjs-notifications/database';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { MemoryTransport } from './memory-transport';
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
    const mail = moduleRef.get(MemoryTransport);
    const store = moduleRef.get(InMemoryStore);
    const user = new User(1, 'ada@example.com');

    await notifications.send(user, new InvoicePaid('INV-1', 42));

    // Mail channel rendered and delivered the message.
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe('ada@example.com');
    expect(mail.sent[0]?.subject).toBe('Invoice INV-1 paid');
    expect(mail.sent[0]?.html).toContain('INV-1');

    // Database channel persisted it for in-app display.
    const stored = await store.getForNotifiable('User', '1');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.type).toBe('InvoicePaid');
    expect(stored[0]?.data).toEqual({ invoiceId: 'INV-1', amount: 42 });
    expect(stored[0]?.readAt).toBeNull();
  });
});
