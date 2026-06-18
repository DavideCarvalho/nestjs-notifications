import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { InMemoryPendingDigestStore } from './in-memory.pending-digest.store';

// The in-memory digest store is the reference implementation for the shared PendingDigestStore
// contract. A fresh instance per run; `reset` swaps in a clean one.
runPendingDigestStoreContract('InMemoryPendingDigestStore', async () => {
  let store = new InMemoryPendingDigestStore();
  return {
    get store() {
      return store;
    },
    reset: async () => {
      store = new InMemoryPendingDigestStore();
    },
  };
});
