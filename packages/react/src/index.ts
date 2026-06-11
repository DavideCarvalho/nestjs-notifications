// Client
export { NotificationsClient, NotificationsApiError } from './client';

// Types
export type {
  NotificationItem,
  PaginatedNotifications,
  NotificationsClientOptions,
  ListParams,
} from './types';

// Pure helpers (also useful for custom renderers)
export {
  mergeNotifications,
  isUnread,
  toTime,
  formatRelativeTime,
  notificationTitle,
  notificationBody,
} from './utils';

// Provider / context
export {
  NotificationsProvider,
  useNotificationsContext,
  useResolvedContext,
} from './hooks/use-notifications-provider';
export type {
  NotificationsProviderProps,
  NotificationsContextValue,
} from './hooks/use-notifications-provider';

// Hooks
export { useNotifications } from './hooks/use-notifications';
export type {
  UseNotificationsOptions,
  UseNotificationsResult,
} from './hooks/use-notifications';
export { useUnreadCount } from './hooks/use-unread-count';
export type {
  UseUnreadCountOptions,
  UseUnreadCountResult,
} from './hooks/use-unread-count';

// Components
export { Inbox } from './components/Inbox';
export type { InboxProps, RenderItemContext } from './components/Inbox';
export { NotificationBell } from './components/NotificationBell';
export type { NotificationBellProps } from './components/NotificationBell';
