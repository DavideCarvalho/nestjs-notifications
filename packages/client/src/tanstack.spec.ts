import { describe, expect, it, vi } from 'vitest';
import type { NotificationsClient } from './client';
import { notificationKeys, notificationMutations, notificationQueries } from './tanstack';

describe('tanstack factories', () => {
  it('builds stable query keys', () => {
    expect(notificationKeys.list({ page: 1 })).toEqual(['notifications', 'list', { page: 1 }]);
    expect(notificationKeys.unreadCount()).toEqual(['notifications', 'unread', 'count']);
  });

  it('queryFn delegates to the client', async () => {
    const client = {
      list: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as NotificationsClient;
    const q = notificationQueries.list(client, { page: 2 });
    expect(q.queryKey).toEqual(['notifications', 'list', { page: 2 }]);
    await q.queryFn();
    expect(client.list).toHaveBeenCalledWith({ page: 2 });
  });

  it('mutationFn delegates to the client', async () => {
    const client = {
      markAsRead: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationsClient;
    await notificationMutations.markAsRead(client).mutationFn('x');
    expect(client.markAsRead).toHaveBeenCalledWith('x');
  });
});
