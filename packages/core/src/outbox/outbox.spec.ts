import { InMemoryOutboxStore, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../channel-registry';
import type { ChannelDriver, DeliveryContext, Notifiable, Notification } from '../interfaces';
import { NotificationService } from '../notification.service';
import { NotificationsModule } from '../notifications.module';
import { type OutboxDispatcherOptions, outboxDispatcher } from '../outbox';

class User implements Notifiable {
  constructor(readonly id: number) {}
  routeNotificationFor(): unknown {
    return `user-${this.id}@example.com`;
  }
  toNotifiableRef() {
    return { type: 'User', id: this.id };
  }
}

class OrderPlaced {
  constructor(readonly orderId = 0) {}
  via(): string[] {
    return ['capture'];
  }
}

class CapturingChannel implements ChannelDriver {
  readonly channel = 'capture';
  readonly deliveries: {
    notifiable: Notifiable;
    orderId: number;
    context: DeliveryContext | undefined;
  }[] = [];
  async send(notifiable: Notifiable, notification: Notification, context?: DeliveryContext) {
    this.deliveries.push({ notifiable, orderId: (notification as OrderPlaced).orderId, context });
  }
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function bootstrap(options: OutboxDispatcherOptions = {}) {
  const channel = new CapturingChannel();
  const moduleRef = await Test.createTestingModule({
    imports: [
      OutboxModule.forRoot({ relay: { pollInterval: 10 } }),
      NotificationsModule.forRoot({
        emitter: true,
        ...outboxDispatcher(options),
        notifications: [OrderPlaced],
        resolveNotifiable: (ref) => new User(Number(ref.id)),
      }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  const store = moduleRef.get(OutboxStorage).messages as InMemoryOutboxStore;
  return { moduleRef, channel, store, notifications: moduleRef.get(NotificationService) };
}

describe('outbox dispatcher (@nestjs/outbox)', () => {
  it('delivers a notification sent in a transaction after it commits, keyed by the outbox message id', async () => {
    const { moduleRef, channel, store, notifications } = await bootstrap();
    let results: unknown;
    await store.transaction(async (tx) => {
      results = await notifications.inTransaction(tx).send(new User(1), new OrderPlaced(42));
      expect(store.stats(Date.now()).pending).toBe(0); // not visible before the commit
    });
    expect(results).toEqual([
      {
        notifiable: expect.any(User),
        results: [{ channel: 'capture', status: 'queued' }],
        tenant: undefined,
      },
    ]);

    await waitFor(() => channel.deliveries.length === 1);
    const [delivery] = channel.deliveries;
    expect(delivery?.orderId).toBe(42);
    expect(delivery?.notifiable).toBeInstanceOf(User);
    expect(delivery?.context?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    await moduleRef.close();
  });

  it('delivers nothing when the transaction rolls back', async () => {
    const { moduleRef, channel, store, notifications } = await bootstrap();
    await expect(
      store.transaction(async (tx) => {
        await notifications.inTransaction(tx).send(new User(2), new OrderPlaced(1));
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(channel.deliveries).toEqual([]);
    await moduleRef.close();
  });

  it('never serializes the transaction handle into the outbox payload', async () => {
    const { moduleRef, store, notifications } = await bootstrap();
    const marker = { secretConnection: true };
    const added: unknown[] = [];
    const original = store.add.bind(store);
    store.add = (tx, messages) => {
      added.push(...messages.map((m) => m.payload));
      return original(tx, messages);
    };
    await notifications.inTransaction(marker).send(new User(3), new OrderPlaced(3));
    expect(JSON.stringify(added)).not.toContain('secretConnection');
    expect(added[0]).toMatchObject({ notifiable: { type: 'User', id: 3 }, channels: ['capture'] });
    await moduleRef.close();
  });

  it('a job sent outside a transaction needs the transaction option', async () => {
    const without = await bootstrap();
    await expect(without.notifications.sendAsync(new User(4), new OrderPlaced(4))).rejects.toThrow(
      /has no transaction/,
    );
    await without.moduleRef.close();

    let opened = 0;
    const withOpener = await bootstrap({
      transaction: (work) => {
        opened++;
        return withOpener.store.transaction(work);
      },
    });
    await withOpener.notifications.sendAsync(new User(5), new OrderPlaced(5));
    expect(opened).toBe(1);
    await waitFor(() => withOpener.channel.deliveries.length === 1);
    await withOpener.moduleRef.close();
  });
});

describe('inTransaction without a transactional dispatcher', () => {
  it('refuses instead of delivering outside the transaction', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotificationsModule.forRoot({ emitter: true })],
    }).compile();
    moduleRef.get(ChannelRegistry).register(new CapturingChannel());
    await expect(
      moduleRef.get(NotificationService).inTransaction({}).send(new User(1), new OrderPlaced()),
    ).rejects.toThrow(/transactional dispatcher/);
  });
});
