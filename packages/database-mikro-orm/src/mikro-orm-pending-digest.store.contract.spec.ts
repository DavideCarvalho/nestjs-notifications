import 'reflect-metadata';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { makeMikroOrmPendingDigestStoreContext } from './pending-digest.contract.testkit';

// Default run: the MikroORM pending-digest store against in-memory SQLite. The same contract runs
// against real Postgres + MySQL in `mikro-orm-pending-digest.store.db.spec.ts` (gated behind
// `pnpm test:db`).
runPendingDigestStoreContract('MikroORM (sqlite)', () =>
  makeMikroOrmPendingDigestStoreContext('sqlite'),
);
