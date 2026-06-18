import { MikroORM, type Options } from '@mikro-orm/core';
import type { NotificationStoreContractContext } from '../../../test-contracts/notification-store.contract';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { NotificationEntity } from './notification.entity';

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

/** Lazily resolve the MikroORM driver for a dialect (driver packages are optional devDeps). */
async function driverFor(dialect: SqlDialect): Promise<any> {
  switch (dialect) {
    case 'sqlite':
      return (await import('@mikro-orm/sqlite')).SqliteDriver;
    case 'postgres':
      return (await import('@mikro-orm/postgresql')).PostgreSqlDriver;
    case 'mysql':
      return (await import('@mikro-orm/mysql')).MySqlDriver;
  }
}

/**
 * Context for the {@link NotificationStore} contract backed by MikroORM on a given dialect. Schema
 * is created via the store's own non-destructive `ensureSchema()` — the production bootstrap path.
 */
export async function makeMikroOrmNotificationStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
): Promise<NotificationStoreContractContext> {
  const driver = await driverFor(dialect);
  const opts: Options =
    dialect === 'sqlite'
      ? { driver, dbName: ':memory:', entities: [NotificationEntity] }
      : {
          driver,
          host: connection?.host,
          port: connection?.port,
          user: connection?.username,
          password: connection?.password,
          dbName: connection?.database,
          entities: [NotificationEntity],
        };

  const orm = await MikroORM.init(opts);
  const store = new MikroOrmNotificationStore(orm.em);
  await store.ensureSchema();

  const table = orm.em
    .getPlatform()
    .quoteIdentifier(orm.getMetadata().get('NotificationEntity').tableName);

  return {
    store,
    reset: async () => {
      await orm.em.getConnection().execute(`DELETE FROM ${table}`);
    },
    teardown: async () => {
      await orm.close(true);
    },
  };
}
