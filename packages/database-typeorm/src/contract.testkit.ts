import { DataSource, type DataSourceOptions } from 'typeorm';
import type { NotificationStoreContractContext } from '../../../test-contracts/notification-store.contract';
import type { PendingDigestStoreContractContext } from '../../../test-contracts/pending-digest-store.contract';
import { NotificationEntity } from './notification.entity';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

/** A dialect the contract matrix runs against. */
export type SqlDialect = 'sqlite' | 'postgres' | 'mysql';

/** Connection coordinates for a containerized engine (from testcontainers). */
export interface DbConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * Build {@link DataSourceOptions} for a dialect. `synchronize` is intentionally OFF — the store
 * creates its schema via its own non-destructive `ensureSchema()`, which is exactly the bootstrap
 * path the DB matrix validates against real Postgres/MySQL engines.
 */
function options(
  dialect: SqlDialect,
  entities: DataSourceOptions['entities'],
  connection?: DbConnection,
): DataSourceOptions {
  if (dialect === 'sqlite') {
    return { type: 'sqlite', database: ':memory:', entities, synchronize: false };
  }
  if (!connection) throw new Error(`${dialect} requires a DbConnection`);
  if (dialect === 'postgres') {
    return { type: 'postgres', ...connection, entities, synchronize: false };
  }
  // MySQL: timezone Z keeps Date round-trips UTC-stable across the wire.
  return { type: 'mysql', ...connection, timezone: 'Z', entities, synchronize: false };
}

async function wipe(dataSource: DataSource, tables: string[]): Promise<void> {
  for (const table of tables) {
    await dataSource.query(`DELETE FROM ${dataSource.driver.escape(table)}`);
  }
}

/** Context for the {@link NotificationStore} contract backed by TypeORM on a given dialect. */
export async function makeTypeOrmNotificationStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
): Promise<NotificationStoreContractContext> {
  const dataSource = new DataSource(options(dialect, [NotificationEntity], connection));
  await dataSource.initialize();
  const store = new TypeOrmNotificationStore(dataSource.getRepository(NotificationEntity));
  await store.ensureSchema();
  return {
    store,
    reset: () => wipe(dataSource, ['notifications']),
    teardown: async () => {
      await dataSource.destroy();
    },
  };
}

/** Context for the {@link PendingDigestStore} contract backed by TypeORM on a given dialect. */
export async function makeTypeOrmPendingDigestStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
): Promise<PendingDigestStoreContractContext> {
  const dataSource = new DataSource(
    options(dialect, [PendingDigestEntity, DigestWindowEntity], connection),
  );
  await dataSource.initialize();
  const store = new TypeOrmPendingDigestStore(
    dataSource.getRepository(PendingDigestEntity),
    dataSource.getRepository(DigestWindowEntity),
  );
  await store.ensureSchema();
  return {
    store,
    reset: () => wipe(dataSource, ['notification_pending_digests', 'notification_digest_windows']),
    teardown: async () => {
      await dataSource.destroy();
    },
  };
}
