import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { type DbConnection, makeMikroOrmNotificationStoreContext } from './contract.testkit';

// Real-engine matrix: the shared NotificationStore contract against Postgres + MySQL via
// testcontainers. Exercises MikroORM's non-destructive `ensureSchema()` (safe schema diff) and the
// JSON/datetime round-trips against the actual engines, not just SQLite.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

describeIfDocker('MikroOrmNotificationStore real-engine matrix', () => {
  describe('postgres', () => {
    let container: StartedPostgreSqlContainer;
    let connection: DbConnection;

    beforeAll(async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      connection = {
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getPassword(),
        database: container.getDatabase(),
      };
    });

    afterAll(async () => {
      await container?.stop();
    });

    runNotificationStoreContract('MikroORM (postgres)', () =>
      makeMikroOrmNotificationStoreContext('postgres', connection),
    );
  });

  describe('mysql', () => {
    let container: StartedMySqlContainer;
    let connection: DbConnection;

    beforeAll(async () => {
      container = await new MySqlContainer('mysql:8.0').start();
      connection = {
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getUserPassword(),
        database: container.getDatabase(),
      };
    });

    afterAll(async () => {
      await container?.stop();
    });

    runNotificationStoreContract('MikroORM (mysql)', () =>
      makeMikroOrmNotificationStoreContext('mysql', connection),
    );
  });
});
