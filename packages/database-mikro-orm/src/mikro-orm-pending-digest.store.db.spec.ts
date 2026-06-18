import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import {
  type DbConnection,
  makeMikroOrmPendingDigestStoreContext,
} from './pending-digest.contract.testkit';

// Real-engine matrix: the shared PendingDigestStore contract against Postgres + MySQL via
// testcontainers. Exercises MikroORM's non-destructive `ensureSchema()` (safe schema diff) and the
// JSON/datetime round-trips + the unique-key idempotency lock against the actual engines.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

describeIfDocker('MikroOrmPendingDigestStore real-engine matrix', () => {
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

    runPendingDigestStoreContract('MikroORM (postgres)', () =>
      makeMikroOrmPendingDigestStoreContext('postgres', connection),
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

    runPendingDigestStoreContract('MikroORM (mysql)', () =>
      makeMikroOrmPendingDigestStoreContext('mysql', connection),
    );
  });
});
