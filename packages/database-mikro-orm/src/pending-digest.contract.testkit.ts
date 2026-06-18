import { MikroORM, type Options } from '@mikro-orm/core';
import type { PendingDigestStoreContractContext } from '../../../test-contracts/pending-digest-store.contract';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';

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
 * Context for the {@link PendingDigestStore} contract backed by MikroORM on a given dialect. Schema
 * is created via the store's own non-destructive `ensureSchema()` — the production bootstrap path.
 */
export async function makeMikroOrmPendingDigestStoreContext(
  dialect: SqlDialect,
  connection?: DbConnection,
): Promise<PendingDigestStoreContractContext> {
  const driver = await driverFor(dialect);
  const entities = [PendingDigestEntity, DigestWindowEntity];
  const opts: Options =
    dialect === 'sqlite'
      ? { driver, dbName: ':memory:', entities }
      : {
          driver,
          host: connection?.host,
          port: connection?.port,
          user: connection?.username,
          password: connection?.password,
          dbName: connection?.database,
          entities,
        };

  const orm = await MikroORM.init(opts);
  const store = new MikroOrmPendingDigestStore(orm.em);
  await store.ensureSchema();

  const quote = (name: string): string =>
    orm.em.getPlatform().quoteIdentifier(orm.getMetadata().get(name).tableName);

  return {
    store,
    reset: async () => {
      await orm.em.getConnection().execute(`DELETE FROM ${quote('PendingDigestEntity')}`);
      await orm.em.getConnection().execute(`DELETE FROM ${quote('DigestWindowEntity')}`);
    },
    teardown: async () => {
      await orm.close(true);
    },
  };
}
