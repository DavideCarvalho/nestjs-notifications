import { ChannelRunner, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { DispatchDriver, NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';

/** Internal event name carrying a {@link NotificationJob} for in-process async delivery. */
export const PROCESS_EVENT = 'nestjs-notifications.process';

/**
 * In-process, non-blocking dispatcher built on `@nestjs/event-emitter`.
 *
 * `dispatch()` emits an internal event carrying the live job and returns immediately, so the
 * caller is never blocked on channel delivery. An async `@OnEvent` handler on the same class
 * then rehydrates the job (a no-op for live objects) and runs the channels.
 *
 * Because delivery stays in the current process, no serialization is required — `hydrateJob`
 * handles live `Notifiable`/`Notification` instances directly.
 *
 * ```ts
 * NotificationsModule.forRoot({ dispatcher: EventEmitterDispatcher });
 * ```
 *
 * The core's `forRoot` registers the dispatcher class as a provider, so the `@OnEvent`
 * handler is discovered and wired by `@nestjs/event-emitter`.
 */
@Injectable()
export class EventEmitterDispatcher implements DispatchDriver {
  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly channelRunner: ChannelRunner,
    private readonly emitter: EventEmitter2,
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    this.emitter.emit(PROCESS_EVENT, job);
  }

  @OnEvent(PROCESS_EVENT, { async: true })
  async handle(job: NotificationJob): Promise<void> {
    if (job.delay && job.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, job.delay));
    }
    const { notifiable, notification } = await this.serializer.hydrateJob(job);
    await this.channelRunner.run(notifiable, notification, job.channels, { tenant: job.tenant });
  }
}
