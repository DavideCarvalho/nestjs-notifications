// Client (re-exported from the headless core for convenience / back-compat)
export {
  NotificationsClient,
  NotificationsApiError,
  createNotificationsClient,
  subscribeNotificationsStream,
} from '@dudousxd/nestjs-notifications-client';

// Types
export type {
  NotificationItem,
  PaginatedNotifications,
  NotificationsClientOptions,
  ListParams,
  NotificationsStreamOptions,
  ReadSyncEvent,
} from '@dudousxd/nestjs-notifications-client';

// Pure helpers (also useful for custom renderers)
export {
  mergeNotifications,
  applyReadEvent,
  isUnread,
  toTime,
  formatRelativeTime,
  notificationTitle,
  notificationBody,
  notificationProgress,
  notificationAction,
} from './utils';
export type { NotificationAction } from './utils';

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
export { useNotificationsStream } from './hooks/use-notifications-stream';
export type { UseNotificationsStreamOptions } from './hooks/use-notifications-stream';

// Components
export { Inbox } from './components/Inbox';
export type { InboxProps, RenderItemContext } from './components/Inbox';
export { NotificationBell } from './components/NotificationBell';
export type { NotificationBellProps } from './components/NotificationBell';
