import type { NotificationsClient } from '@dudousxd/nestjs-notifications-client';
import type {
  NotificationItem,
  NotificationsClientOptions,
} from '@dudousxd/nestjs-notifications-client';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNotifications } from '../hooks/use-notifications';
import { useUnreadCount } from '../hooks/use-unread-count';
import {
  formatRelativeTime,
  isUnread,
  notificationAction,
  notificationBody,
  notificationProgress,
  notificationTitle,
} from '../utils';
import { NotificationBell } from './NotificationBell';

/** Render-prop context handed to a custom `renderItem`. */
export interface RenderItemContext {
  markAsRead: (id: string) => void;
  remove: (id: string) => void;
}

/** Props for {@link Inbox}. */
export interface InboxProps {
  /** Explicit client (overrides the provider). */
  client?: NotificationsClient;
  /** Build a client inline (overrides the provider). */
  clientOptions?: NotificationsClientOptions;
  /** SSE endpoint for live unread-count updates (overrides the provider). */
  sseUrl?: string;
  /** Page size. Default 20. */
  perPage?: number;
  /** Poll interval (ms) for the unread count when no SSE. Default 30000. */
  pollIntervalMs?: number;
  /** Custom row renderer; falls back to the built-in row. */
  renderItem?: (item: NotificationItem, ctx: RenderItemContext) => ReactNode;
  /** Shown when the feed is empty. */
  emptyState?: ReactNode;
  /** Panel heading text. Default `"Notifications"`. */
  title?: string;
  /** Mark a notification read when its row is clicked. Default `true`. */
  markReadOnClick?: boolean;
  /** Called when a row is clicked (after optional mark-as-read). */
  onItemClick?: (item: NotificationItem) => void;
  className?: string;
  style?: CSSProperties;
  /** Class applied to the dropdown panel. */
  panelClassName?: string;
}

const styles: Record<string, CSSProperties> = {
  root: { position: 'relative', display: 'inline-block', fontFamily: 'inherit' },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 360,
    maxWidth: '90vw',
    maxHeight: 480,
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    color: '#111827',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    zIndex: 1000,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
  },
  title: { fontSize: 14, fontWeight: 600, margin: 0 },
  markAll: {
    border: 'none',
    background: 'transparent',
    color: '#2563eb',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 },
  row: {
    padding: '12px 16px',
    borderBottom: '1px solid #f8fafc',
    boxSizing: 'border-box',
  },
  rowUnread: { background: '#eff6ff' },
  rowMain: {
    display: 'flex',
    gap: 8,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'transparent',
  },
  dot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: '50%',
    background: '#2563eb',
    flexShrink: 0,
  },
  dotSpacer: { width: 8, flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: 600, margin: 0 },
  rowText: {
    fontSize: 12,
    color: '#6b7280',
    margin: '2px 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  rowTime: { fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 8 },
  progressTrack: {
    height: 4,
    marginTop: 8,
    marginLeft: 16,
    borderRadius: 2,
    background: '#e5e7eb',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: '#2563eb',
    borderRadius: 2,
    transition: 'width 200ms ease',
  },
  action: {
    display: 'inline-block',
    marginTop: 8,
    marginLeft: 16,
    fontSize: 12,
    fontWeight: 600,
    color: '#2563eb',
    textDecoration: 'none',
  },
  footer: { padding: 8, textAlign: 'center', borderTop: '1px solid #f1f5f9' },
  loadMore: {
    border: 'none',
    background: 'transparent',
    color: '#2563eb',
    fontSize: 13,
    cursor: 'pointer',
    padding: '6px 12px',
  },
  empty: { padding: '32px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 },
  status: { padding: '8px 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' },
};

/**
 * Drop-in notifications inbox: a bell with an unread badge that toggles a
 * dropdown panel listing notifications with relative time, read/unread styling,
 * "mark all read", click-to-read, and "load more" infinite scroll.
 *
 * Configure once via `<NotificationsProvider>`, or pass `client`/`clientOptions`
 * and `sseUrl` directly.
 *
 * ```tsx
 * <Inbox sseUrl="/api/notifications/stream" />
 * ```
 */
export function Inbox({
  client,
  clientOptions,
  sseUrl,
  perPage,
  pollIntervalMs,
  renderItem,
  emptyState,
  title = 'Notifications',
  markReadOnClick = true,
  onItemClick,
  className,
  style,
  panelClassName,
}: InboxProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const hookOptions = { client, clientOptions };
  const { count, refresh: refreshCount } = useUnreadCount({
    ...hookOptions,
    sseUrl,
    pollIntervalMs,
  });
  const {
    notifications,
    loading,
    error,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    remove,
    refresh,
  } = useNotifications({ ...hookOptions, perPage });

  // Refresh the feed each time the panel opens so it reflects live pushes.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleMarkAsRead = useCallback(
    (id: string) => {
      void markAsRead(id).then(() => refreshCount());
    },
    [markAsRead, refreshCount],
  );

  const handleRemove = useCallback(
    (id: string) => {
      void remove(id).then(() => refreshCount());
    },
    [remove, refreshCount],
  );

  const handleMarkAll = useCallback(() => {
    void markAllAsRead().then(() => refreshCount());
  }, [markAllAsRead, refreshCount]);

  const handleItemClick = useCallback(
    (item: NotificationItem) => {
      if (markReadOnClick && isUnread(item)) handleMarkAsRead(item.id);
      onItemClick?.(item);
    },
    [markReadOnClick, handleMarkAsRead, onItemClick],
  );

  // Infinite scroll: load more when scrolled near the bottom.
  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) void loadMore();
  }, [hasMore, loading, loadMore]);

  return (
    <div ref={rootRef} className={className} style={{ ...styles.root, ...style }}>
      <NotificationBell count={count} expanded={open} onClick={() => setOpen((v) => !v)} />
      {open ? (
        <section aria-label={title} className={panelClassName} style={styles.panel}>
          <div style={styles.header}>
            <h2 style={styles.title}>{title}</h2>
            {count > 0 ? (
              <button type="button" style={styles.markAll} onClick={handleMarkAll}>
                Mark all read
              </button>
            ) : null}
          </div>

          {error ? <div style={styles.status}>Couldn't load notifications.</div> : null}

          {notifications.length === 0 && !loading ? (
            <div style={styles.empty}>{emptyState ?? 'You are all caught up.'}</div>
          ) : (
            <ul ref={listRef} style={styles.list} onScroll={onScroll}>
              {notifications.map((item) => (
                <li key={item.id}>
                  {renderItem ? (
                    renderItem(item, { markAsRead: handleMarkAsRead, remove: handleRemove })
                  ) : (
                    <DefaultRow item={item} onClick={() => handleItemClick(item)} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {loading ? <div style={styles.status}>Loading…</div> : null}

          {hasMore ? (
            <div style={styles.footer}>
              <button
                type="button"
                style={styles.loadMore}
                onClick={() => void loadMore()}
                disabled={loading}
              >
                Load more
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

interface DefaultRowProps {
  item: NotificationItem;
  onClick: () => void;
}

function DefaultRow({ item, onClick }: DefaultRowProps) {
  const unread = isUnread(item);
  const body = notificationBody(item);
  const progress = notificationProgress(item);
  const action = notificationAction(item);
  return (
    <div style={{ ...styles.row, ...(unread ? styles.rowUnread : null) }}>
      <button type="button" onClick={onClick} style={styles.rowMain}>
        {unread ? (
          <span style={styles.dot} aria-hidden="true" />
        ) : (
          <span style={styles.dotSpacer} />
        )}
        <span style={styles.rowBody}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={styles.rowTitle}>{notificationTitle(item)}</span>
            <span style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</span>
          </span>
          {body ? <span style={styles.rowText}>{body}</span> : null}
        </span>
      </button>
      {progress != null ? (
        // biome-ignore lint/a11y/useFocusableInteractive: a progressbar is a status indicator, not a focusable control
        <div
          style={styles.progressTrack}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
        </div>
      ) : null}
      {action ? (
        <a
          href={action.url}
          style={styles.action}
          onClick={(e) => e.stopPropagation()}
          rel="noopener noreferrer"
        >
          {action.label}
        </a>
      ) : null}
    </div>
  );
}
