// The library's Prisma models in their own Postgres schema (Prisma's `@@schema`, see "Database
// schema" in the docs). The client is generated at test time from prisma/test.pg.schema.prisma into
// the gitignored generated/pg-schema-client. Skips without Docker. `pnpm test:db` only.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { PrismaNotificationStore } from './prisma-notification.store';
import { PrismaPendingDigestStore } from './prisma-pending-digest.store';

const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
const pkgRoot = fileURLToPath(new URL('..', import.meta.url));

describeIfDocker('Prisma models in their own schema (@@schema) [real Postgres]', () => {
  let pg: StartedPostgreSqlContainer | undefined;
  let prisma: any;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = pg.getConnectionUri();
    const schema = 'prisma/test.pg.schema.prisma';
    const run = (args: string[]) =>
      execFileSync('npx', ['prisma', ...args], {
        cwd: pkgRoot,
        stdio: 'ignore',
        env: { ...process.env, PRISMA_PG_URL: url },
      });
    run(['generate', '--schema', schema]);
    run(['db', 'push', '--schema', schema, '--skip-generate', '--accept-data-loss']);
    const generatedClientPath = '../generated/pg-schema-client/index.js';
    const { PrismaClient } = await import(generatedClientPath);
    prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$connect();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect?.();
    await pg?.stop();
  });

  it('keeps every table in the schema, and nothing in public', async () => {
    const rows: { table_schema: string; table_name: string }[] = await prisma.$queryRawUnsafe(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema IN ('public', 'notif_lib') ORDER BY table_name`,
    );
    expect(rows).toEqual([
      { table_schema: 'notif_lib', table_name: 'DigestWindow' },
      { table_schema: 'notif_lib', table_name: 'Notification' },
      { table_schema: 'notif_lib', table_name: 'PendingDigest' },
    ]);
  });

  runNotificationStoreContract('Prisma (postgres, @@schema)', async () => ({
    store: new PrismaNotificationStore(prisma),
    reset: async () => {
      await prisma.notification.deleteMany();
    },
  }));

  runPendingDigestStoreContract('Prisma (postgres, @@schema)', async () => ({
    store: new PrismaPendingDigestStore(prisma),
    reset: async () => {
      await prisma.pendingDigest.deleteMany();
      await prisma.digestWindow.deleteMany();
    },
  }));
});
