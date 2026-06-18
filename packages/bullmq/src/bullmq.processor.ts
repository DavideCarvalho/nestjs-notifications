import { ChannelRunner, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { NotificationJob } from '@dudousxd/nestjs-notifications-core';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './constants';
import { BULLMQ_DISPATCHER_OPTIONS, type BullmqDispatcherOptions } from './options';

/**
 * Consumes notification jobs from the BullMQ queue and delivers them. Register it as a
 * provider on the worker process (the {@link bullmqDispatcher} helper does this for you).
 *
 * When a job exhausts all configured `attempts` it is terminally failed; the optional
 * {@link BullmqDispatcherOptions.onFailed} hook then fires so the job can be routed to a
 * dead-letter queue, alerted on, or persisted.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class BullmqNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(BullmqNotificationProcessor.name);

  constructor(
    private readonly serializer: NotificationSerializer,
    private readonly channelRunner: ChannelRunner,
    @Optional()
    @Inject(BULLMQ_DISPATCHER_OPTIONS)
    private readonly options?: BullmqDispatcherOptions,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    const data = job.data;
    const { notifiable, notification } = await this.serializer.hydrateJob(data);
    // Re-establish the captured context (causer/tenant/trace) on the worker so the
    // out-of-process delivery still records WHO triggered it.
    await this.channelRunner.run(notifiable, notification, data.channels, {
      tenant: data.tenant,
      captured: data.captured,
    });
  }

  /**
   * Fires on every failed attempt. We only treat a job as terminally failed — and therefore a
   * dead-letter candidate — once it has used up all its attempts; until then BullMQ will retry it.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined): Promise<void> {
    const onFailed = this.options?.onFailed;
    if (!onFailed || !job) return;

    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const reason = job.failedReason ?? 'unknown';
    try {
      await onFailed(job, reason);
    } catch (err) {
      // Never let dead-letter handling crash the worker.
      this.logger.error(`onFailed handler threw for job ${job.id ?? '?'}: ${String(err)}`);
    }
  }
}
