import { describe, expect, it, vi } from 'vitest';
import type { NotificationsClient } from './client';
import {
  nextNotificationsPage,
  notificationKeys,
  notificationMutations,
  notificationQueries,
} from './tanstack';

describe('tanstack factories', () => {
  it('builds stable query keys', () => {
    expect(notificationKeys.list({ page: 1 })).toEqual(['notifications', 'list', { page: 1 }]);
    expect(notificationKeys.unreadCount()).toEqual(['notifications', 'unread', 'count', {}]);
    expect(notificationKeys.unreadCount({ types: ['A'] })).toEqual([
      'notifications',
      'unread',
      'count',
      { types: ['A'] },
    ]);
    expect(notificationKeys.unread({ types: ['A'] })).toEqual([
      'notifications',
      'unread',
      { types: ['A'] },
    ]);
  });

  it('queryFn delegates to the client', async () => {
    const client = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as NotificationsClient;
    const q = notificationQueries.list(client, { page: 2 });
    expect(q.queryKey).toEqual(['notifications', 'list', { page: 2 }]);
    await q.queryFn();
    expect(client.list).toHaveBeenCalledWith({ page: 2 });
  });

  it('infiniteList pages by meta.currentPage / meta.lastPage', async () => {
    const client = {
      list: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as NotificationsClient;
    const q = notificationQueries.infiniteList(client, { size: 10 });
    expect(q.queryKey).toEqual(['notifications', 'list', { size: 10 }, 'infinite']);
    expect(q.initialPageParam).toBe(1);
    await q.queryFn({ pageParam: 3 });
    expect(client.list).toHaveBeenCalledWith({ size: 10, page: 3 });

    const meta = { total: 25, perPage: 10, lastPage: 3, firstPage: 1 };
    expect(nextNotificationsPage({ data: [], meta: { ...meta, currentPage: 2 } })).toBe(3);
    expect(nextNotificationsPage({ data: [], meta: { ...meta, currentPage: 3 } })).toBeUndefined();
  });

  it('mutationFn delegates to the client', async () => {
    const client = {
      markAsRead: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsClient;
    await notificationMutations.markAsRead(client).mutationFn('x');
    expect(client.markAsRead).toHaveBeenCalledWith('x');
  });
});
