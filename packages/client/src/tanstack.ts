import type { NotificationsClient } from './client';
import type { ListParams } from './types';

/** Stable query keys for cache management/invalidation. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: ListParams) => ['notifications', 'list', params ?? {}] as const,
  unread: () => ['notifications', 'unread'] as const,
  unreadCount: () => ['notifications', 'unread', 'count'] as const,
};

/** queryOptions-shaped factories: spread into useQuery({ ...notificationQueries.list(client) }). */
export const notificationQueries = {
  list: (client: NotificationsClient, params?: ListParams) => ({
    queryKey: notificationKeys.list(params),
    queryFn: () => client.list(params),
  }),
  unread: (client: NotificationsClient) => ({
    queryKey: notificationKeys.unread(),
    queryFn: () => client.unread(),
  }),
  unreadCount: (client: NotificationsClient) => ({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => client.unreadCount(),
  }),
};

/** mutationOptions-shaped factories: spread into useMutation({ ...notificationMutations.markAsRead(client) }). */
export const notificationMutations = {
  markAsRead: (client: NotificationsClient) => ({
    mutationFn: (id: string) => client.markAsRead(id),
  }),
  markAllAsRead: (client: NotificationsClient) => ({ mutationFn: () => client.markAllAsRead() }),
  remove: (client: NotificationsClient) => ({ mutationFn: (id: string) => client.remove(id) }),
};
