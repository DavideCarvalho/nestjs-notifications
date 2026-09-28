import 'reflect-metadata';
import {
  DatabaseChannel,
  DatabaseChannelModule,
  NOTIFICATION_STORE,
  NotificationsQueryService,
} from '@dudousxd/nestjs-notifications-database';
import { PENDING_DIGEST_STORE } from '@dudousxd/nestjs-notifications-preferences';
import { PGlite } from '@electric-sql/pglite';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleNotificationStoreModule } from './drizzle-notification-store.module';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStoreModule } from './drizzle-pending-digest-store.module';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
import { createNotificationTables } from './schema';
import { DRIZZLE_NOTIFICATIONS_DB, type DrizzlePgDatabase } from './tokens';

class InvoicePaid {
  constructor(readonly amount: number) {}
  via() {
    return ['database'];
  }
  toDatabase() {
    return { amount: this.amount };
  }
}

describe('Drizzle store modules (Nest wiring, pglite)', () => {
  let client: PGlite;
  let db: DrizzlePgDatabase;

  beforeAll(() => {
    client = new PGlite();
    db = drizzle(client) as unknown as DrizzlePgDatabase;
  });

  afterAll(async () => {
    await client.close();
  });

  it('DatabaseChannelModule.forRoot({ store }) builds the store from the imported module and auto-creates the schema', async () => {
    const tables = createNotificationTables({ tableNames: { notifications: 'inbox_items' } });
    const moduleRef = await Test.createTestingModule({
      imports: [
        DatabaseChannelModule.forRoot({
          store: DrizzleNotificationStore,
          imports: [DrizzleNotificationStoreModule.forRoot({ db, tables })],
          controller: false,
        }),
      ],
    }).compile();
    await moduleRef.init(); // SchemaInitializer → ensureSchema()

    const channel = moduleRef.get(DatabaseChannel);
    const notifiable = { id: 7, constructor: { name: 'User' } };
    await channel.send(notifiable as never, new InvoicePaid(42) as never);

    const query = moduleRef.get(NotificationsQueryService);
    const page = await query.paginate({ type: 'User', id: '7' });
    expect(page.meta.total).toBe(1);
    expect(page.items[0]).toMatchObject({ type: 'InvoicePaid', data: { amount: 42 } });
    expect(await query.unreadCount({ type: 'User', id: '7' })).toBe(1);

    const rows = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM inbox_items');
    expect(rows.rows[0]?.n).toBe(1);
    await moduleRef.close();
  });

  it('pairs with a sibling DatabaseChannelModule.forFeature() (the documented wiring)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DrizzleNotificationStoreModule.forRoot({
          db,
          tables: createNotificationTables({ tableNames: { notifications: 'sibling_items' } }),
        }),
        DatabaseChannelModule.forFeature({ controller: false }),
      ],
    }).compile();
    await moduleRef.init();
    await moduleRef
      .get(DatabaseChannel)
      .send({ id: 1, constructor: { name: 'User' } } as never, new InvoicePaid(1) as never);
    const rows = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM sibling_items');
    expect(rows.rows[0]?.n).toBe(1);
    await moduleRef.close();
  });

  it('forRootAsync binds NOTIFICATION_STORE from a factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DrizzleNotificationStoreModule.forRootAsync({
          useFactory: () => ({
            db,
            tables: createNotificationTables({ tableNames: { notifications: 'async_items' } }),
          }),
        }),
      ],
    }).compile();
    const store = moduleRef.get<DrizzleNotificationStore>(NOTIFICATION_STORE);
    expect(store).toBeInstanceOf(DrizzleNotificationStore);
    await store.ensureSchema();
    const saved = await store.save({
      type: 'A',
      notifiableType: 'User',
      notifiableId: '1',
      data: {},
    });
    expect(await store.findById(saved.id)).toMatchObject({ id: saved.id, type: 'A' });
  });

  it('forFeature() uses a DRIZZLE_NOTIFICATIONS_DB provided by a global module (default tables)', async () => {
    @Global()
    @Module({
      providers: [{ provide: DRIZZLE_NOTIFICATIONS_DB, useValue: db }],
      exports: [DRIZZLE_NOTIFICATIONS_DB],
    })
    class DbModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [DbModule, DrizzleNotificationStoreModule.forFeature()],
    }).compile();
    const store = moduleRef.get<DrizzleNotificationStore>(NOTIFICATION_STORE);
    await store.ensureSchema();
    const saved = await store.save({
      type: 'B',
      notifiableType: 'User',
      notifiableId: '2',
      data: {},
    });
    const rows = await client.query<{ id: string }>('SELECT id FROM notifications');
    expect(rows.rows.map((r) => r.id)).toContain(saved.id);
  });

  it('DrizzlePendingDigestStoreModule binds the preferences PENDING_DIGEST_STORE token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DrizzlePendingDigestStoreModule.forRoot({ db })],
    }).compile();
    const store = moduleRef.get(PENDING_DIGEST_STORE);
    expect(store).toBeInstanceOf(DrizzlePendingDigestStore);
    await (store as DrizzlePendingDigestStore).ensureSchema();
    expect(await (store as DrizzlePendingDigestStore).tryLockWindow('daily', '2026-01-01')).toBe(
      true,
    );
    expect(await (store as DrizzlePendingDigestStore).tryLockWindow('daily', '2026-01-01')).toBe(
      false,
    );
  });
});
