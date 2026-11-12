import 'reflect-metadata';
import type { DataSource, Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { NotificationEntity, notificationEntity } from './notification.entity';
import {
  DigestWindowEntity,
  PendingDigestEntity,
  digestWindowEntity,
  pendingDigestEntity,
} from './pending-digest.entity';
import { ensureNotificationsTable, notificationsManagedTables } from './schema';
import { assertSchemaName, schemaOf } from './schema-name';
import { TypeOrmNotificationStoreModule } from './typeorm-notification-store.module';
import { TypeOrmNotificationStore } from './typeorm-notification.store';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

const fakeRepo = (target: unknown, type = 'postgres') =>
  ({ target, manager: { connection: { options: { type } } } }) as unknown as Repository<never>;

describe('schema option (TypeORM)', () => {
  it('builds one entity per schema that inherits the columns', () => {
    expect(notificationEntity()).toBe(NotificationEntity);
    const a = notificationEntity({ schema: 'notif_lib' });
    expect(a).toBe(notificationEntity({ schema: 'notif_lib' }));
    expect(a).not.toBe(notificationEntity({ schema: 'other' }));
    expect(new a()).toBeInstanceOf(NotificationEntity);
    expect(schemaOf(a)).toBe('notif_lib');
    expect(schemaOf(NotificationEntity)).toBeUndefined();
    expect(pendingDigestEntity()).toBe(PendingDigestEntity);
    expect(digestWindowEntity()).toBe(DigestWindowEntity);
    expect(schemaOf(pendingDigestEntity({ schema: 's' }))).toBe('s');
  });

  it('validates the name', () => {
    for (const bad of ['a.b', '1abc', 'x'.repeat(64), 'a"b', '']) {
      expect(() => assertSchemaName(bad)).toThrow(/schema/);
    }
    expect(() => assertSchemaName('notif_lib$1')).not.toThrow();
  });

  it('SQLite with a schema fails at construction and at ensure', async () => {
    const entity = notificationEntity({ schema: 'notif_lib' });
    expect(() => new TypeOrmNotificationStore(fakeRepo(entity, 'better-sqlite3'))).toThrow(
      /has no schemas/,
    );
    expect(
      () => new TypeOrmNotificationStore(fakeRepo(NotificationEntity, 'sqlite')),
    ).not.toThrow();
    const ds = { options: { type: 'sqlite' } } as unknown as DataSource;
    await expect(ensureNotificationsTable(ds, { schema: 'notif_lib' })).rejects.toThrow(
      /has no schemas/,
    );
  });

  it('the digest repositories must share the schema', () => {
    expect(
      () =>
        new TypeOrmPendingDigestStore(
          fakeRepo(pendingDigestEntity({ schema: 'a' })),
          fakeRepo(digestWindowEntity({ schema: 'b' })),
        ),
    ).toThrow(/same `schema`/);
  });

  it('managed tables name the schema', () => {
    expect(notificationsManagedTables()).toEqual(['notifications']);
    expect(notificationsManagedTables({ schema: 'notif_lib' })).toEqual([
      'notif_lib.notifications',
    ]);
  });

  it('forFeature({ schema }) registers the schema entity', () => {
    const mod = TypeOrmNotificationStoreModule.forFeature({ schema: 'notif_lib' });
    expect(JSON.stringify(mod.providers?.length)).toBe('2');
    const plain = TypeOrmNotificationStoreModule.forFeature();
    expect(plain.providers?.[0]).toBe(TypeOrmNotificationStore);
  });
});
