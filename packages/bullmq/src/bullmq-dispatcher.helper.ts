import type { DispatchDriver } from '@nestjs-notifications/core';
import { BullModule } from '@nestjs/bullmq';
import type { ModuleMetadata, Provider, Type } from '@nestjs/common';
import { BullmqNotificationDispatcher } from './bullmq.dispatcher';
import { BullmqNotificationProcessor } from './bullmq.processor';
import { NOTIFICATIONS_QUEUE } from './constants';

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
 * Requires `BullModule.forRoot(...)` (the connection) to be configured elsewhere in the app.
 */
export function bullmqDispatcher(): BullmqDispatcherConfig {
  return {
    dispatcher: BullmqNotificationDispatcher,
    imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
    providers: [BullmqNotificationProcessor],
  };
}
