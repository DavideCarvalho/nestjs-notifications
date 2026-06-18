import 'reflect-metadata';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { makeTypeOrmNotificationStoreContext } from './contract.testkit';

// Default run: the TypeORM store against in-memory SQLite. The same contract runs against real
// Postgres + MySQL in `typeorm-notification.store.db.spec.ts` (gated behind `pnpm test:db`).
runNotificationStoreContract('TypeORM (sqlite)', () =>
  makeTypeOrmNotificationStoreContext('sqlite'),
);
