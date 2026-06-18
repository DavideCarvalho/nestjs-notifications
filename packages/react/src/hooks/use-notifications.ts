import type { NotificationsClient } from '@dudousxd/nestjs-notifications-client';
import type {
  NotificationItem,
  NotificationsClientOptions,
  ReadSyncEvent,
} from '@dudousxd/nestjs-notifications-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyReadEvent as applyReadEventToList, mergeNotifications } from '../utils';
import { useResolvedContext } from './use-notifications-provider';

/** Options for {@link useNotifications}. */
export interface UseNotificationsOptions {
  /** Explicit client (overrides the provider). */
  client?: NotificationsClient | undefined;
  /** Build a client inline (overrides the provider). */
  clientOptions?: NotificationsClientOptions | undefined;
  /** Page size for `list` / `loadMore`. Default 20. */
  perPage?: number | undefined;
}

/** Return value of {@link useNotifications}. */
export interface UseNotificationsResult {
  notifications: NotificationItem[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  /** Load the next page and append (deduped). */
  loadMore: () => Promise<void>;
  /** Optimistically mark one as read, then persist. */
  markAsRead: (id: string) => Promise<void>;
  /** Optimistically mark all as read, then persist. */
  markAllAsRead: () => Promise<void>;
  /** Optimistically remove one, then persist. */
  remove: (id: string) => Promise<void>;
  /** Reload page 1 from scratch. */
  refresh: () => Promise<void>;
  /**
   * Apply a cross-device read event (from {@link useNotificationsStream}'s `onRead`): patch the
   * matching item read in place — or all items when `notificationId` is null — WITHOUT a refetch.
   * Local-only: it does not call the API (the other device already persisted the read).
   */
  applyReadEvent: (event: ReadSyncEvent) => void;
}

/**
 * Fetches the notifications feed (page 1 on mount), with paginated `loadMore`,
 * de-duplication by id, and optimistic mutations that roll back on error.
 *
 * ```tsx
 * const { notifications, loadMore, hasMore, markAsRead } = useNotifications();
 * ```
 */
export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsResult {
  const { client } = useResolvedContext(options);
  const perPage = options.perPage ?? 20;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const pageRef = useRef(0);
  const totalRef = useRef(0);
  // Guards against state updates after unmount and overlapping loads.
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPage = useCallback(
    async (page: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await client.list({ page, perPage });
        if (!mountedRef.current) return;
        pageRef.current = result.meta.page;
        totalRef.current = result.meta.total;
        setNotifications((prev) =>
          replace ? mergeNotifications([], result.items) : mergeNotifications(prev, result.items),
        );
        setHasMore(result.meta.page < result.meta.lastPage && result.items.length > 0);
      } catch (err) {
        if (mountedRef.current) setError(toError(err));
      } finally {
        if (mountedRef.current) setLoading(false);
        loadingRef.current = false;
      }
    },
    [client, perPage],
  );

  const refresh = useCallback(async () => {
    await loadPage(1, true);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return;
    await loadPage(pageRef.current + 1, false);
  }, [hasMore, loadPage]);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  const markAsRead = useCallback(
    async (id: string) => {
      const snapshot = notifications;
      const now = new Date();
      setNotifications((prev) =>
        prev.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: now } : n)),
      );
      try {
        await client.markAsRead(id);
      } catch (err) {
        if (mountedRef.current) {
          setNotifications(snapshot);
          setError(toError(err));
        }
        throw err;
      }
    },
    [client, notifications],
  );

  const markAllAsRead = useCallback(async () => {
    const snapshot = notifications;
    const now = new Date();
    setNotifications((prev) => prev.map((n) => (n.readAt == null ? { ...n, readAt: now } : n)));
    try {
      await client.markAllAsRead();
    } catch (err) {
      if (mountedRef.current) {
        setNotifications(snapshot);
        setError(toError(err));
      }
      throw err;
    }
  }, [client, notifications]);

  const remove = useCallback(
    async (id: string) => {
      const snapshot = notifications;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await client.remove(id);
        totalRef.current = Math.max(0, totalRef.current - 1);
      } catch (err) {
        if (mountedRef.current) {
          setNotifications(snapshot);
          setError(toError(err));
        }
        throw err;
      }
    },
    [client, notifications],
  );

  const applyReadEvent = useCallback((event: ReadSyncEvent) => {
    setNotifications((prev) => applyReadEventToList(prev, event));
  }, []);

  return {
    notifications,
    loading,
    error,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    remove,
    refresh,
    applyReadEvent,
  };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
