import { Injectable } from '@nestjs/common';
import { ChannelRunner } from './channel-runner';
import type { DispatchDriver, NotificationJob } from './interfaces';
import { NotificationSerializer } from './serializer';

/**
 * The default dispatcher: runs channels inline, in the current process. No queue, no
 * serialization on the happy path — if the job already carries live objects they are used
 * directly; otherwise they are rehydrated (so the same dispatcher works on a worker).
 */
@Injectable()
export class SyncDispatcher implements DispatchDriver {
  constructor(
    private readonly runner: ChannelRunner,
    private readonly serializer: NotificationSerializer,
  ) {}

  async dispatch(job: NotificationJob): Promise<void> {
    const { notifiable, notification } = await this.serializer.hydrateJob(job);
    await this.runner.run(notifiable, notification, job.channels, {
      tenant: job.tenant,
      captured: job.captured,
    });
  }
}
