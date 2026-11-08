import 'reflect-metadata';
import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { PGlite } from '@electric-sql/pglite';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, describe, expect, it } from 'vitest';
import { DrizzleNotificationStoreModule } from './drizzle-notification-store.module';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStoreModule } from './drizzle-pending-digest-store.module';
import { drizzleConnectionToken } from './module-options';
import { createNotificationTables } from './schema';
import { DRIZZLE_NOTIFICATIONS_DB, DRIZZLE_NOTIFICATION_TABLES } from './tokens';

describe('@nestjs/drizzle connections', () => {
  const client = new PGlite();
  afterAll(() => client.close());

  it('drizzleConnectionToken() matches @nestjs/drizzle getDrizzleToken()', () => {
    for (const name of [undefined, 'default', 'analytics']) {
      expect(drizzleConnectionToken(name)).toBe(getDrizzleToken(name));
    }
  });

  it.each([undefined, 'notifications'])(
    'forRoot({ connectionName: %s }) uses the DrizzleModule database',
    async (name) => {
      const db = drizzle(client);
      const moduleRef = await Test.createTestingModule({
        imports: [
          DrizzleModule.forRoot({ db, autoCloseConnection: false, ...(name ? { name } : {}) }),
          DrizzleNotificationStoreModule.forRoot({ connectionName: name ?? 'default' }),
        ],
      }).compile();
      expect(moduleRef.get(DRIZZLE_NOTIFICATIONS_DB)).toBe(db);
      expect(moduleRef.get(NOTIFICATION_STORE)).toBeInstanceOf(DrizzleNotificationStore);
      await moduleRef.close();
    },
  );

  it.each([undefined, 'notifications'])(
    'forRootAsync({ connectionName: %s, useFactory }) uses the DrizzleModule database',
    async (name) => {
      const db = drizzle(client);
      const tables = createNotificationTables({ tableNames: { notifications: 'inbox_items' } });
      const moduleRef = await Test.createTestingModule({
        imports: [
          DrizzleModule.forRoot({ db, autoCloseConnection: false, ...(name ? { name } : {}) }),
          DrizzleNotificationStoreModule.forRootAsync({
            connectionName: name ?? 'default',
            useFactory: async () => ({ tables }),
          }),
        ],
      }).compile();
      expect(moduleRef.get(DRIZZLE_NOTIFICATIONS_DB)).toBe(db);
      expect(moduleRef.get(DRIZZLE_NOTIFICATION_TABLES)).toBe(tables);
      expect(moduleRef.get(NOTIFICATION_STORE)).toBeInstanceOf(DrizzleNotificationStore);
      await moduleRef.close();
    },
  );

  it('forRootAsync({ connectionName }) works without a factory', async () => {
    const db = drizzle(client);
    const moduleRef = await Test.createTestingModule({
      imports: [
        DrizzleModule.forRoot({ db, autoCloseConnection: false }),
        DrizzlePendingDigestStoreModule.forRootAsync({ connectionName: 'default' }),
      ],
    }).compile();
    expect(moduleRef.get(DRIZZLE_NOTIFICATIONS_DB)).toBe(db);
    expect(moduleRef.get(DRIZZLE_NOTIFICATION_TABLES)).toBeNull();
    await moduleRef.close();
  });

  it('forRootAsync refuses a factory db next to connectionName', async () => {
    const db = drizzle(client);
    await expect(
      Test.createTestingModule({
        imports: [
          DrizzleModule.forRoot({ db, autoCloseConnection: false }),
          DrizzleNotificationStoreModule.forRootAsync({
            connectionName: 'default',
            useFactory: () => ({ db }) as never,
          }),
        ],
      }).compile(),
    ).rejects.toThrow(/either `connectionName` or a factory `db`/);
  });
});
