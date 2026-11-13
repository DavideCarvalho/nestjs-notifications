import { DataSource, type DataSourceOptions } from 'typeorm';
import type { NotificationStoreContractContext } from '../../../test-contracts/notification-store.contract';
import type { PendingDigestStoreContractContext } from '../../../test-contracts/pending-digest-store.contract';
import { notificationEntity } from './notification.entity';
import { digestWindowEntity, pendingDigestEntity } from './pending-digest.entity';
import { quotePath } from './schema-name';
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
    await dataSource.query(`DELETE FROM ${quotePath(dataSource, table)}`);
  }
}

/** Context for the {@link NotificationStore} contract backed by TypeORM on a given dialect. */
export async function makeTypeOrmNotificationStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
  schema?: string,
): Promise<NotificationStoreContractContext> {
  const entity = notificationEntity({ schema });
  const dataSource = new DataSource(options(dialect, [entity], connection));
  await dataSource.initialize();
  const store = new TypeOrmNotificationStore(dataSource.getRepository(entity));
  await store.ensureSchema();
  const table = schema ? `${schema}.notifications` : 'notifications';
  return {
    store,
    reset: () => wipe(dataSource, [table]),
    teardown: async () => {
      await dataSource.destroy();
    },
  };
}

/** Context for the {@link PendingDigestStore} contract backed by TypeORM on a given dialect. */
export async function makeTypeOrmPendingDigestStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
  schema?: string,
): Promise<PendingDigestStoreContractContext> {
  const entries = pendingDigestEntity({ schema });
  const windows = digestWindowEntity({ schema });
  const dataSource = new DataSource(options(dialect, [entries, windows], connection));
  await dataSource.initialize();
  const store = new TypeOrmPendingDigestStore(
    dataSource.getRepository(entries),
    dataSource.getRepository(windows),
  );
  await store.ensureSchema();
  const prefix = schema ? `${schema}.` : '';
  return {
    store,
    reset: () =>
      wipe(dataSource, [
        `${prefix}notification_pending_digests`,
        `${prefix}notification_digest_windows`,
      ]),
    teardown: async () => {
      await dataSource.destroy();
    },
  };
}
