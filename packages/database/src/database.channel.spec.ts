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

describe('DatabaseChannel persisted type', () => {
  class GenericNotification {
    constructor(private readonly eventName: string) {}
    notificationType() {
      return this.eventName;
    }
    toArray() {
      return { name: this.eventName };
    }
  }

  it('persists the instance-level notificationType() instead of the class name', async () => {
    const store = {
      save: vi.fn().mockResolvedValue({ id: 'x' }),
    } as unknown as NotificationStore;
    const channel = new DatabaseChannel(store);

    await channel.send(user, new GenericNotification('FILE_EXPORT_RUNNING'));

    const arg = (store.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.type).toBe('FILE_EXPORT_RUNNING');
  });

  it('still persists the class name when notificationType() is absent', async () => {
    const store = {
      save: vi.fn().mockResolvedValue({ id: 'x' }),
    } as unknown as NotificationStore;
    const channel = new DatabaseChannel(store);

    await channel.send(user, new PlainNotification());

    const arg = (store.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(arg.type).toBe('PlainNotification');
  });
});

describe('DatabaseChannel captured context', () => {
  it('persists causer/tenant/trace from the captured delivery context', async () => {
    const store = new InMemoryStore();
    const channel = new DatabaseChannel(store);

    await channel.send(user, new PlainNotification(), {
      captured: { causer: { type: 'User', id: 7 }, tenantId: 'acme', traceId: 'tx-9' },
    });

    const [row] = await store.getForNotifiable('User', '1');
    expect(row?.causerType).toBe('User');
    expect(row?.causerId).toBe('7');
    expect(row?.tenantId).toBe('acme'); // captured tenant fills an unscoped delivery
    expect(row?.traceId).toBe('tx-9');
  });

  it('prefers the explicit delivery tenant over the captured tenant', async () => {
    const store = new InMemoryStore();
    const channel = new DatabaseChannel(store);

    await channel.send(user, new PlainNotification(), {
      tenant: 'scoped',
      captured: { tenantId: 'acme' },
    });

    const [row] = await store.getForNotifiable('User', '1', 'scoped');
    expect(row?.tenantId).toBe('scoped');
  });

  it('leaves causer/trace null when there is no captured context (back-compat)', async () => {
    const store = new InMemoryStore();
    const channel = new DatabaseChannel(store);

    await channel.send(user, new PlainNotification());

    const [row] = await store.getForNotifiable('User', '1');
    expect(row?.causerType).toBeNull();
    expect(row?.causerId).toBeNull();
    expect(row?.traceId).toBeNull();
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
