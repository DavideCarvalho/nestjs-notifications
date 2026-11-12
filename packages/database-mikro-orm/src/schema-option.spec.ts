import 'reflect-metadata';
import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { MikroOrmNotificationStoreModule } from './mikro-orm-notification-store.module';
import {
  MikroOrmNotificationStore,
  notificationsManagedTables,
} from './mikro-orm-notification.store';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { NotificationEntity, notificationEntity } from './notification.entity';
import {
  DigestWindowEntity,
  PendingDigestEntity,
  digestWindowEntity,
  pendingDigestEntity,
} from './pending-digest.entity';
import { ensureNotificationsTable } from './schema';
import { MIKRO_ORM_NOTIFICATIONS_OPTIONS, assertSchemaName, schemaOf } from './schema-name';

const fakeEm = (platform: string) =>
  ({
    getPlatform: () => new (({ [platform]: class {} })[platform] as new () => object)(),
  }) as unknown as EntityManager;

describe('schema option (MikroORM)', () => {
  it('builds one entity class per schema that inherits the base', () => {
    expect(notificationEntity()).toBe(NotificationEntity);
    const a = notificationEntity({ schema: 'notif_lib' });
    expect(a).toBe(notificationEntity({ schema: 'notif_lib' }));
    expect(a.name).toBe('NotificationEntity_notif_lib');
    expect(new a()).toBeInstanceOf(NotificationEntity);
    expect(schemaOf(a)).toBe('notif_lib');
    expect(schemaOf(NotificationEntity)).toBeUndefined();
    expect(pendingDigestEntity()).toBe(PendingDigestEntity);
    expect(digestWindowEntity()).toBe(DigestWindowEntity);
    expect(digestWindowEntity({ schema: 's' }).name).toBe('DigestWindowEntity_s');
  });

  it('validates the name', () => {
    for (const bad of ['a.b', '1abc', 'x'.repeat(64), 'a"b', '']) {
      expect(() => assertSchemaName(bad)).toThrow(/schema/);
      expect(() => notificationEntity({ schema: bad })).toThrow(/schema/);
    }
  });

  it('SQLite with a schema fails at construction and at ensure', async () => {
    const sqlite = fakeEm('SqlitePlatform');
    expect(() => new MikroOrmNotificationStore(sqlite, { schema: 'notif_lib' })).toThrow(
      /SQLite has no schemas/,
    );
    expect(() => new MikroOrmPendingDigestStore(sqlite, { schema: 'notif_lib' })).toThrow(
      /SQLite has no schemas/,
    );
    expect(() => new MikroOrmNotificationStore(sqlite)).not.toThrow();
    await expect(ensureNotificationsTable(sqlite, { schema: 'notif_lib' })).rejects.toThrow(
      /SQLite has no schemas/,
    );
    expect(
      () => new MikroOrmNotificationStore(fakeEm('PostgreSqlPlatform'), { schema: 'notif_lib' }),
    ).not.toThrow();
  });

  it('managed tables name the schema', () => {
    expect(notificationsManagedTables()).toEqual(['notifications']);
    expect(notificationsManagedTables({ schema: 'notif_lib' })).toEqual([
      'notif_lib.notifications',
    ]);
  });

  it('forFeature({ schema }) binds the options; without it nothing changes', () => {
    const mod = MikroOrmNotificationStoreModule.forFeature({ schema: 'notif_lib' });
    expect(mod.providers?.[0]).toEqual({
      provide: MIKRO_ORM_NOTIFICATIONS_OPTIONS,
      useValue: { schema: 'notif_lib' },
    });
    expect(MikroOrmNotificationStoreModule.forFeature().providers?.[0]).toBe(
      MikroOrmNotificationStore,
    );
  });
});
