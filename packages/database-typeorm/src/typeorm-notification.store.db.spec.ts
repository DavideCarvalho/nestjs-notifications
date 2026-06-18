import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { type DbConnection, makeTypeOrmNotificationStoreContext } from './contract.testkit';

// Real-engine matrix: the shared NotificationStore contract against Postgres + MySQL via
// testcontainers. This is the blind spot the sqlite-only suites missed — it exercises the live
// `ensureSchema()` (schema-create + non-destructive column-add) and the TableUtils deep-import
// against the actual engines. Skips gracefully when Docker is unavailable.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

describeIfDocker('TypeOrmNotificationStore real-engine matrix', () => {
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

    runNotificationStoreContract('TypeORM (postgres)', () =>
      makeTypeOrmNotificationStoreContext('postgres', connection),
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

    runNotificationStoreContract('TypeORM (mysql)', () =>
      makeTypeOrmNotificationStoreContext('mysql', connection),
    );
  });
});
