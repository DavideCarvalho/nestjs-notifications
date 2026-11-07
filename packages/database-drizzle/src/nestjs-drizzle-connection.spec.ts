import 'reflect-metadata';
import { NOTIFICATION_STORE } from '@dudousxd/nestjs-notifications-database';
import { PGlite } from '@electric-sql/pglite';
import { DrizzleModule, getDrizzleToken } from '@nestjs/drizzle';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, describe, expect, it } from 'vitest';
import { DrizzleNotificationStoreModule } from './drizzle-notification-store.module';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { drizzleConnectionToken } from './module-options';
import { DRIZZLE_NOTIFICATIONS_DB } from './tokens';

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
});
