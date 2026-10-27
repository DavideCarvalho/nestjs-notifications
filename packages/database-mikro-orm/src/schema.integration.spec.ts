import { MikroORM } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { NotificationEntity } from './notification.entity';
import { notificationsSchemaSql } from './schema';

describe('MikroOrmNotificationStore.ensureSchema (integration, sqlite)', () => {
  let orm: MikroORM;
  let store: MikroOrmNotificationStore;

  beforeAll(async () => {
    // No schema created up front — ensureSchema() must create the table.
    orm = await MikroORM.init({
      driver: SqliteDriver,
      dbName: ':memory:',
      entities: [NotificationEntity],
    });
    store = new MikroOrmNotificationStore(orm.em);
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('produces non-destructive SQL and creates the table on demand', async () => {
    const sql = await notificationsSchemaSql(orm.em.fork());
    expect(sql).toMatch(/create table/i);
    expect(sql).toMatch(/notifications/i);
    expect(sql).not.toMatch(/drop table/i);

    await store.ensureSchema();
    await store.ensureSchema(); // idempotent

    const saved = await store.save({
      type: 'Welcome',
      notifiableType: 'User',
      notifiableId: '7',
      data: { hi: true },
    });
    expect(saved.id).toEqual(expect.any(String));
    const rows = await store.getForNotifiable('User', '7');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({ hi: true });
  });

  it('creates the inbox index, and adds it on a deployment whose schema predates it', async () => {
    const connection = orm.em.getConnection();
    const indexNames = async (): Promise<string[]> =>
      ((await connection.execute(`PRAGMA index_list('notifications')`)) as { name: string }[]).map(
        (row) => row.name,
      );
    expect(await indexNames()).toContain('notifications_notifiable_idx');
    const columns = (await connection.execute(
      `PRAGMA index_info('notifications_notifiable_idx')`,
    )) as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(['notifiable_type', 'notifiable_id', 'created_at']);

    // An older deployment: no index, and a fingerprint recorded from the older metadata.
    await connection.execute('DROP INDEX notifications_notifiable_idx');
    await connection.execute(`UPDATE notifications_schema_meta SET fingerprint = 'stale'`);

    await store.ensureSchema();

    expect(await indexNames()).toContain('notifications_notifiable_idx');
    expect(await store.getForNotifiable('User', '7')).toHaveLength(1);
  });
});
