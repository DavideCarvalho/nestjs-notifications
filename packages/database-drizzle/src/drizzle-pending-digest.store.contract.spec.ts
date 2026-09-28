import 'reflect-metadata';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { makeDrizzlePendingDigestStoreContext } from './contract.testkit';

// Default run: PGlite (in-process Postgres). Real Postgres runs in the `*.db.spec.ts` matrix.
runPendingDigestStoreContract('Drizzle (pglite)', () =>
  makeDrizzlePendingDigestStoreContext({ kind: 'pglite' }),
);
