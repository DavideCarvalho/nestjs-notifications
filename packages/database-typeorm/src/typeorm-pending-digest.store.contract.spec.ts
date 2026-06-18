import 'reflect-metadata';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { makeTypeOrmPendingDigestStoreContext } from './contract.testkit';

// Default run: the TypeORM pending-digest store against in-memory SQLite. Real PG + MySQL run in
// `typeorm-pending-digest.store.db.spec.ts` (gated behind `pnpm test:db`).
runPendingDigestStoreContract('TypeORM (sqlite)', () =>
  makeTypeOrmPendingDigestStoreContext('sqlite'),
);
