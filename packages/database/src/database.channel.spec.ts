import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseChannel } from './database.channel';
import { InMemoryStore } from './in-memory.store';
import type { NotificationStore } from './interfaces';

const user: Notifiable = {
  toNotifiableRef: (): NotifiableRef => ({ type: 'User', id: '1' }),
};

class PlainNotification {
  toArray() {
    return { progress: 10 };
  }
}

class ProgressNotification {
  constructor(private readonly exportId: string) {}
  toArray() {
    return { progress: 50 };
  }
  databaseKey() {
    return `file-export:${this.exportId}`;
  }
}

describe('DatabaseChannel upsert routing', () => {
  it('uses save() when the notification has no databaseKey', async () => {
    const store = {
      save: vi.fn().mockResolvedValue({ id: 'x' }),
      upsert: vi.fn(),
    } as unknown as NotificationStore;
    const channel = new DatabaseChannel(store);

    await channel.send(user, new PlainNotification());

    expect(store.save).toHaveBeenCalledOnce();
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('uses upsert() with the databaseKey as id when present', async () => {
    const store = {
      save: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: 'file-export:42' }),
    } as unknown as NotificationStore;
    const channel = new DatabaseChannel(store);

    await channel.send(user, new ProgressNotification('42'));

    expect(store.upsert).toHaveBeenCalledOnce();
    expect(store.save).not.toHaveBeenCalled();
    const arg = (store.upsert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.id).toBe('file-export:42');
    expect(arg.notifiableType).toBe('User');
    expect(arg.notifiableId).toBe('1');
    expect(arg.data).toEqual({ progress: 50 });
  });

  it('falls back to save() when the store has no upsert()', async () => {
    const store = { save: vi.fn().mockResolvedValue({ id: 'x' }) } as unknown as NotificationStore;
    const channel = new DatabaseChannel(store);

    await channel.send(user, new ProgressNotification('42'));

    expect(store.save).toHaveBeenCalledOnce();
  });
});

describe('InMemoryStore.upsert', () => {
  it('inserts then updates the same row, preserving createdAt and resetting readAt', async () => {
    const store = new InMemoryStore();
    const created = await store.upsert({
      id: 'file-export:1',
      type: 'Export',
      notifiableType: 'User',
      notifiableId: '1',
      data: { progress: 0 },
    });
    await store.markAsRead('file-export:1');

    const updated = await store.upsert({
      id: 'file-export:1',
      type: 'Export',
      notifiableType: 'User',
      notifiableId: '1',
      data: { progress: 100 },
    });

    const all = await store.getForNotifiable('User', '1');
    expect(all).toHaveLength(1); // updated in place, not duplicated
    expect(updated.data).toEqual({ progress: 100 });
    expect(updated.createdAt).toEqual(created.createdAt); // preserved
    expect(updated.readAt).toBeNull(); // an update re-notifies (unread again)
  });
});
