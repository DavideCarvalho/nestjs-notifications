import type { NotificationsClient } from './client';
import type { ListParams, NotificationsFilterParams, PaginatedNotifications } from './types';

/**
 * `getNextPageParam` for the offset list envelope: the next 1-based page, or `undefined` on the
 * last one. Also usable as the override for a codegen-generated `infiniteQueryOptions`.
 */
export function nextNotificationsPage(page: PaginatedNotifications): number | undefined {
  const { currentPage, lastPage } = page.meta;
  return currentPage < lastPage ? currentPage + 1 : undefined;
}

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
  /**
   * infiniteQueryOptions-shaped factory: spread into `useInfiniteQuery`. Pages through `list` by
   * `meta.currentPage` / `meta.lastPage`; `params.page` is ignored (the page param drives it).
   */
  infiniteList: (client: NotificationsClient, params?: Omit<ListParams, 'page'>) => ({
    queryKey: [...notificationKeys.list(params), 'infinite'] as const,
    queryFn: ({ pageParam }: { pageParam: number }) => client.list({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextNotificationsPage,
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
