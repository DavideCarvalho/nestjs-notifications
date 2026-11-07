/**
 * `@dudousxd/nestjs-notifications-core/outbox`: transactional dispatch over `@nestjs/outbox`
 * (optional peer, needed only when this subpath is imported).
 */
export {
  NOTIFICATIONS_OUTBOX_CONSUMER,
  NOTIFICATIONS_OUTBOX_OPTIONS,
  NOTIFICATIONS_OUTBOX_TOPIC,
} from './outbox/constants';
export type { OutboxDispatcherOptions } from './outbox/options';
export { OutboxDispatcher } from './outbox/outbox.dispatcher';
export { OutboxNotificationHandler } from './outbox/outbox-notification.handler';
export { outboxDispatcher, type OutboxDispatcherConfig } from './outbox/outbox-dispatcher.helper';
