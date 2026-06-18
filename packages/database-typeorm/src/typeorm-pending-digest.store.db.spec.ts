import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { type DbConnection, makeTypeOrmPendingDigestStoreContext } from './contract.testkit';

// Real-engine matrix for the pending-digest store: enqueue / grouped-read / clear / window-lock
// idempotency against Postgres + MySQL. The window lock relies on a duplicate-PK insert failing —
// behavior that differs subtly per engine, so it must be asserted on the real ones.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

describeIfDocker('TypeOrmPendingDigestStore real-engine matrix', () => {
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

    runPendingDigestStoreContract('TypeORM (postgres)', () =>
      makeTypeOrmPendingDigestStoreContext('postgres', connection),
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

    runPendingDigestStoreContract('TypeORM (mysql)', () =>
      makeTypeOrmPendingDigestStoreContext('mysql', connection),
    );
  });
});
