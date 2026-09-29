import 'reflect-metadata';
import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import {
  DatabaseChannel,
  DatabaseChannelModule,
  NOTIFICATION_STORE,
  NotificationsQueryService,
} from '@dudousxd/nestjs-notifications-database';
import {
  DigestCollector,
  PENDING_DIGEST_STORE,
  PreferencesModule,
} from '@dudousxd/nestjs-notifications-preferences';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaNotificationClientLike } from './prisma-client';
import { PrismaNotificationStoreModule } from './prisma-notification-store.module';
import { PrismaNotificationStore } from './prisma-notification.store';
import type { PrismaPendingDigestClientLike } from './prisma-pending-digest-client';
import { PrismaPendingDigestStoreModule } from './prisma-pending-digest-store.module';
import { PrismaPendingDigestStore } from './prisma-pending-digest.store';

class InvoicePaid {
  constructor(readonly amount: number) {}
  via() {
    return ['database'];
  }
  toDatabase() {
    return { amount: this.amount };
  }
}

function notificationClient() {
  const notification = {
    create: vi.fn(async (args: { data: any }) => ({
      ...args.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => [] as any[]),
    count: vi.fn(async () => 1),
    delete: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  return { client: { notification } as unknown as PrismaNotificationClientLike, notification };
}

function digestClient(): PrismaPendingDigestClientLike {
  const windows = new Set<string>();
  return {
    pendingDigest: {
      create: vi.fn(async (args: { data: any }) => args.data),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    digestWindow: {
      create: vi.fn(async (args: { data: any }) => {
        if (windows.has(args.data.id)) throw new Error('Unique constraint failed');
        windows.add(args.data.id);
        return args.data;
      }),
    },
  } as unknown as PrismaPendingDigestClientLike;
}

describe('Prisma store modules (Nest wiring)', () => {
  it('pairs with a SIBLING DatabaseChannelModule.forFeature() (the documented wiring)', async () => {
    const { client, notification } = notificationClient();
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrismaNotificationStoreModule.forRoot({ client }),
        DatabaseChannelModule.forFeature({ controller: false }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(NOTIFICATION_STORE)).toBeInstanceOf(PrismaNotificationStore);
    await moduleRef
      .get(DatabaseChannel)
      .send({ id: 7, constructor: { name: 'User' } } as never, new InvoicePaid(42) as never);
    expect(notification.create).toHaveBeenCalledOnce();
    expect(
      await moduleRef.get(NotificationsQueryService).unreadCount({ type: 'User', id: 7 }),
    ).toBe(1);
    expect(notification.count).toHaveBeenCalled();
    await moduleRef.close();
  });

  it('forFeature(client) also pairs with a sibling DatabaseChannelModule.forFeature()', async () => {
    const { client } = notificationClient();
    const moduleRef = await Test.createTestingModule({
      imports: [
        PrismaNotificationStoreModule.forFeature(client),
        DatabaseChannelModule.forFeature({ controller: false }),
      ],
    }).compile();
    expect(moduleRef.get(DatabaseChannel)).toBeInstanceOf(DatabaseChannel);
    await moduleRef.close();
  });

  it('pairs with a SIBLING PreferencesModule.forDigest({ store }) (the documented wiring)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        NotificationsModule.forRoot({ global: true }),
        PrismaPendingDigestStoreModule.forRoot({ client: digestClient() }),
        PreferencesModule.forDigest({ store: PrismaPendingDigestStore }),
      ],
    }).compile();
    await moduleRef.init();

    const store = moduleRef.get<PrismaPendingDigestStore>(PENDING_DIGEST_STORE);
    expect(store).toBeInstanceOf(PrismaPendingDigestStore);
    expect(moduleRef.get(DigestCollector)).toBeInstanceOf(DigestCollector);
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(true);
    expect(await store.tryLockWindow('daily', '2026-01-01')).toBe(false);
    await moduleRef.close();
  });
});
