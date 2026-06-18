import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { InMemoryStore } from './in-memory.store';

// The in-memory store is the reference implementation: it must satisfy the same shared contract as
// every persistent adapter. A fresh instance per run; `reset` just swaps in a new one.
runNotificationStoreContract('InMemoryStore', async () => {
  let store = new InMemoryStore();
  return {
    get store() {
      return store;
    },
    reset: async () => {
      store = new InMemoryStore();
    },
  };
});
