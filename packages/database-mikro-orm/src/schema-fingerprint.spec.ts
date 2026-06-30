import type { UpdateSchemaOptions } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/core';
import { SqliteDriver } from '@mikro-orm/sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { NotificationEntity } from './notification.entity';
import { SCHEMA_META_TABLE, computeExpectedFingerprint } from './schema-fingerprint';

const OWNED = new Set(['notifications']);

/**
 * Counts how many times the expensive whole-DB schema diff (`getUpdateSchemaSQL`) is invoked. Wraps
 * `platform.getSchemaGenerator` so it catches every heal regardless of generator caching, and ONLY
 * counts calls made after this is installed (steady-state assertions install it post-heal).
 */
function trackIntrospection(orm: MikroORM): () => number {
  const platform = orm.em.getPlatform();
  const realGetSchemaGenerator = platform.getSchemaGenerator.bind(platform);
  let calls = 0;
  vi.spyOn(platform, 'getSchemaGenerator').mockImplementation((driver, em) => {
    const generator = realGetSchemaGenerator(driver, em);
    const realGetUpdateSchemaSQL = generator.getUpdateSchemaSQL.bind(generator);
    generator.getUpdateSchemaSQL = (options?: UpdateSchemaOptions) => {
      calls += 1;
      return realGetUpdateSchemaSQL(options);
    };
    return generator;
  });
  return () => calls;
}

async function readStoredRow(orm: MikroORM): Promise<{ fingerprint?: string } | undefined> {
  const rows: Array<{ fingerprint?: string }> = await orm.em
    .getConnection()
    .execute(`select fingerprint from ${SCHEMA_META_TABLE} where id = ?`, ['notifications'], 'all');
  return Array.isArray(rows) ? rows[0] : undefined;
}

describe('MikroOrmNotificationStore.ensureSchema (fingerprint gate, sqlite)', () => {
  let orm: MikroORM;
  let store: MikroOrmNotificationStore;

  beforeEach(async () => {
    // Fresh in-memory DB per test: no schema, no marker.
    orm = await MikroORM.init({
      driver: SqliteDriver,
      dbName: ':memory:',
      entities: [NotificationEntity],
    });
    store = new MikroOrmNotificationStore(orm.em);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close(true);
  });

  it('creates the marker table before any other statement', async () => {
    const executeSpy = vi.spyOn(orm.em.getConnection(), 'execute');

    await store.ensureSchema();

    const firstQuery = String(executeSpy.mock.calls[0]?.[0]).toLowerCase();
    expect(firstQuery).toContain(`create table if not exists ${SCHEMA_META_TABLE}`);
  });

  it('heals then records the fingerprint on a fresh database', async () => {
    const introspections = trackIntrospection(orm);

    await store.ensureSchema();

    // The heal ran (introspection happened) ...
    expect(introspections()).toBeGreaterThanOrEqual(1);
    // ... the table is usable ...
    const saved = await store.save({
      type: 'Welcome',
      notifiableType: 'User',
      notifiableId: '1',
      data: { hi: true },
    });
    expect(saved.id).toEqual(expect.any(String));
    // ... and the marker now holds the expected fingerprint.
    const expected = computeExpectedFingerprint(orm.em, OWNED);
    expect((await readStoredRow(orm))?.fingerprint).toBe(expected);
  });

  it('skips the introspection when the stored fingerprint already matches', async () => {
    await store.ensureSchema(); // first boot heals + writes the marker

    const introspections = trackIntrospection(orm); // count only the steady-state boot
    await store.ensureSchema();

    expect(introspections()).toBe(0);
  });

  it('re-heals and rewrites the marker when the stored fingerprint no longer matches', async () => {
    await store.ensureSchema();
    // Simulate drift / a SCHEMA_REVISION bump by corrupting the stored fingerprint.
    await orm.em
      .getConnection()
      .execute(
        `update ${SCHEMA_META_TABLE} set fingerprint = ? where id = ?`,
        ['stale', 'notifications'],
        'run',
      );

    const introspections = trackIntrospection(orm);
    await store.ensureSchema();

    expect(introspections()).toBeGreaterThanOrEqual(1);
    const expected = computeExpectedFingerprint(orm.em, OWNED);
    expect((await readStoredRow(orm))?.fingerprint).toBe(expected);
  });

  it('computeExpectedFingerprint is a deterministic sha256 over the owned tables', () => {
    const first = computeExpectedFingerprint(orm.em, OWNED);
    const second = computeExpectedFingerprint(orm.em, OWNED);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    // Scoping to no owned tables changes the digest — proof unrelated tables aren't hashed in.
    expect(computeExpectedFingerprint(orm.em, new Set())).not.toBe(first);
  });
});
