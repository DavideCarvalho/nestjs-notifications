import 'reflect-metadata';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { makeDrizzlePendingDigestStoreContext } from './contract.testkit';

// Real-engine run: the shared contract against a real Postgres (testcontainers), exercising the
// live `ensureSchema()` DDL. Set `NOTIFICATIONS_TEST_PG_URL` to reuse an existing server instead
// of starting a container. Skips gracefully when neither is available.
const external = process.env.NOTIFICATIONS_TEST_PG_URL;
const describeIfDb = external || isDockerAvailable() ? describe : describe.skip;

describeIfDb('DrizzlePendingDigestStore real-engine matrix', () => {
  describe('postgres', () => {
    let container: StartedPostgreSqlContainer | undefined;
    let connectionString: string;

    beforeAll(async () => {
      if (external) {
        connectionString = external;
        return;
      }
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      connectionString = container.getConnectionUri();
    });

    afterAll(async () => {
      await container?.stop();
    });

    runPendingDigestStoreContract('Drizzle (postgres)', () =>
      makeDrizzlePendingDigestStoreContext({ kind: 'postgres', connectionString }),
    );
  });
});
