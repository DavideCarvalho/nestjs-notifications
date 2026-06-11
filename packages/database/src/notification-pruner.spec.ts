import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from './in-memory.store';
import type { NewStoredNotification, NotificationStore } from './interfaces';
import { NotificationPruner, type PruneOptions } from './notification-pruner';

const base: NewStoredNotification = {
  type: 'Test',
  notifiableType: 'User',
  notifiableId: '1',
  data: {},
};

describe('InMemoryStore.prune', () => {
  it('deletes rows created at or before the cutoff', async () => {
    const store = new InMemoryStore();
    const old = await store.save(base);
    const fresh = await store.save(base);
    // Backdate the first row.
    (old as { createdAt: Date }).createdAt = new Date('2000-01-01');

    const deleted = await store.prune({ before: new Date('2001-01-01') });

    expect(deleted).toBe(1);
    expect(await store.getForNotifiable('User', '1')).toHaveLength(1);
    expect((await store.getForNotifiable('User', '1'))[0]?.id).toBe(fresh.id);
  });

  it('with onlyRead, keeps unread rows even if old', async () => {
    const store = new InMemoryStore();
    const unread = await store.save(base);
    const read = await store.save(base);
    (unread as { createdAt: Date }).createdAt = new Date('2000-01-01');
    (read as { createdAt: Date }).createdAt = new Date('2000-01-01');
    await store.markAsRead(read.id);

    const deleted = await store.prune({ before: new Date('2001-01-01'), onlyRead: true });

    expect(deleted).toBe(1);
    expect((await store.getForNotifiable('User', '1'))[0]?.id).toBe(unread.id);
  });
});

describe('NotificationPruner', () => {
  it('sweep() prunes with a cutoff derived from olderThan', async () => {
    const prune = vi.fn().mockResolvedValue(3);
    const store = { prune } as unknown as NotificationStore;
    const options: PruneOptions = { olderThan: 60_000, onlyRead: true };

    const deleted = await new NotificationPruner(store, options).sweep();

    expect(deleted).toBe(3);
    expect(prune).toHaveBeenCalledOnce();
    const arg = prune.mock.calls[0]?.[0] as { before: Date; onlyRead?: boolean };
    expect(arg.onlyRead).toBe(true);
    expect(arg.before).toBeInstanceOf(Date);
  });

  it('sweep() is a no-op when prune is disabled', async () => {
    const store = { prune: vi.fn() } as unknown as NotificationStore;
    expect(await new NotificationPruner(store, null).sweep()).toBe(0);
    expect(store.prune).not.toHaveBeenCalled();
  });

  it('warns and skips when the store has no prune()', () => {
    const store = {} as unknown as NotificationStore;
    const pruner = new NotificationPruner(store, { olderThan: 1000 });
    // Should not throw even though the store can't prune.
    expect(() => pruner.onApplicationBootstrap()).not.toThrow();
  });
});
