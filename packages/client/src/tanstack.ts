import type { NotificationsClient } from './client';
import type { ListParams, NotificationsFilterParams } from './types';

/** Stable query keys for cache management/invalidation. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: ListParams) => ['notifications', 'list', params ?? {}] as const,
  unread: (params?: NotificationsFilterParams) =>
    ['notifications', 'unread', params ?? {}] as const,
  unreadCount: (params?: NotificationsFilterParams) =>
    ['notifications', 'unread', 'count', params ?? {}] as const,
};

/** queryOptions-shaped factories: spread into useQuery({ ...notificationQueries.list(client) }). */
export const notificationQueries = {
  list: (client: NotificationsClient, params?: ListParams) => ({
    queryKey: notificationKeys.list(params),
    queryFn: () => client.list(params),
  }),
  unread: (client: NotificationsClient, params?: NotificationsFilterParams) => ({
    queryKey: notificationKeys.unread(params),
    queryFn: () => client.unread(params),
  }),
  unreadCount: (client: NotificationsClient, params?: NotificationsFilterParams) => ({
    queryKey: notificationKeys.unreadCount(params),
    queryFn: () => client.unreadCount(params),
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
