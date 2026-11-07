import type { Provider, Type } from '@nestjs/common';
import type { DispatchDriver } from '../interfaces';
import { NOTIFICATIONS_OUTBOX_OPTIONS } from './constants';
import type { OutboxDispatcherOptions } from './options';
import { OutboxNotificationHandler } from './outbox-notification.handler';
import { OutboxDispatcher } from './outbox.dispatcher';

/** Slice of `NotificationsModule.forRoot` options contributed by the outbox dispatcher. */
export interface OutboxDispatcherConfig {
  dispatcher: Type<DispatchDriver>;
  providers: Provider[];
}

/**
 * Wires the transactional outbox dispatcher into `NotificationsModule`. Spread it into `forRoot`;
 * `OutboxModule.forRoot()` (and its store) is configured by the app, as documented at
 * https://docs.nestjs.com/techniques/outbox:
 *
 * ```ts
 * NotificationsModule.forRoot({
 *   ...outboxDispatcher({ transaction: (work) => db.transaction(work) }),
 *   notifications: [OrderPlaced],
 *   resolveNotifiable,
 * });
 * ```
 */
export function outboxDispatcher(options: OutboxDispatcherOptions = {}): OutboxDispatcherConfig {
  return {
    dispatcher: OutboxDispatcher,
    providers: [
      OutboxNotificationHandler,
      { provide: NOTIFICATIONS_OUTBOX_OPTIONS, useValue: options },
    ],
  };
}
