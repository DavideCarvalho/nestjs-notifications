import 'reflect-metadata';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { makeDrizzleNotificationStoreContext } from './contract.testkit';

// Default run: the Drizzle store against PGlite (an in-process Postgres — real Postgres SQL, no
// Docker). The same contract runs against a real Postgres server in
// `drizzle-notification.store.db.spec.ts` (gated behind `pnpm test:db`).
runNotificationStoreContract('Drizzle (pglite)', () =>
  makeDrizzleNotificationStoreContext({ kind: 'pglite' }),
);
