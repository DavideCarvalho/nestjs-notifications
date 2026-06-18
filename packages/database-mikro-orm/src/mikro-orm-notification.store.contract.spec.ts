import 'reflect-metadata';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { makeMikroOrmNotificationStoreContext } from './contract.testkit';

// Default run: the MikroORM store against in-memory SQLite. The same contract runs against real
// Postgres + MySQL in `mikro-orm-notification.store.db.spec.ts` (gated behind `pnpm test:db`).
runNotificationStoreContract('MikroORM (sqlite)', () =>
  makeMikroOrmNotificationStoreContext('sqlite'),
);
