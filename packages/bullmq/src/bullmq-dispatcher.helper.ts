import type { DispatchDriver } from '@dudousxd/nestjs-notifications-core';
import { BullModule } from '@nestjs/bullmq';
import type { ModuleMetadata, Provider, Type } from '@nestjs/common';
import { BullmqNotificationDispatcher } from './bullmq.dispatcher';
import { BullmqNotificationProcessor } from './bullmq.processor';
import { NOTIFICATIONS_QUEUE } from './constants';
import { BULLMQ_DISPATCHER_OPTIONS, type BullmqDispatcherOptions } from './options';

/** Slice of `NotificationsModule.forRoot` options contributed by the BullMQ dispatcher. */
export interface BullmqDispatcherConfig {
  dispatcher: Type<DispatchDriver>;
  imports: NonNullable<ModuleMetadata['imports']>;
  providers: Provider[];
}

/**
 * Wires the BullMQ dispatcher into `NotificationsModule`. Spread the result into `forRoot`:
 *
 * ```ts
 * NotificationsModule.forRoot({ ...bullmqDispatcher(), notifications: [...], resolveNotifiable });
 * ```
 *
 * Pass {@link BullmqDispatcherOptions} to tune retry/backoff, job retention, and the failed-job
 * (dead-letter) hook:
 *
 * ```ts
 * bullmqDispatcher({
 *   attempts: 5,
 *   backoff: { type: 'exponential', delay: 2000 },
 *   removeOnComplete: { age: 3600 },
 *   removeOnFail: 1000,
 *   onFailed: (job, reason) => deadLetterQueue.add('failed', { id: job?.id, reason }),
 * });
 * ```
 *
 * Requires `BullModule.forRoot(...)` (the connection) to be configured elsewhere in the app.
 */
export function bullmqDispatcher(options?: BullmqDispatcherOptions): BullmqDispatcherConfig {
  const providers: Provider[] = [BullmqNotificationProcessor];
  if (options) {
    providers.push({ provide: BULLMQ_DISPATCHER_OPTIONS, useValue: options });
  }
  return {
    dispatcher: BullmqNotificationDispatcher,
    imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
    providers,
  };
}
