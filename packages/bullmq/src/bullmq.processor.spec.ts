import type { ChannelRunner, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BullmqNotificationProcessor } from './bullmq.processor';
import type { BullmqDispatcherOptions } from './options';

function makeProcessor(options?: BullmqDispatcherOptions) {
  const serializer = {
    hydrateJob: vi.fn(),
    serialize: vi.fn(),
  } as unknown as NotificationSerializer;
  const channelRunner = { run: vi.fn() } as unknown as ChannelRunner;
  const processor = new BullmqNotificationProcessor(serializer, channelRunner, options);
  return { serializer, channelRunner, processor };
}

function failedJob(partial: Partial<Job>): Job {
  return {
    attemptsMade: 3,
    failedReason: 'boom',
    opts: { attempts: 3 },
    ...partial,
  } as unknown as Job;
}

describe('BullmqNotificationProcessor failed handling', () => {
  it('invokes onFailed once attempts are exhausted (DLQ hook)', async () => {
    const onFailed = vi.fn();
    const { processor } = makeProcessor({ attempts: 3, onFailed });
    const job = failedJob({ attemptsMade: 3, opts: { attempts: 3 } });

    await processor.onFailed(job);

    expect(onFailed).toHaveBeenCalledWith(job, 'boom');
  });

  it('does not invoke onFailed while retries remain', async () => {
    const onFailed = vi.fn();
    const { processor } = makeProcessor({ attempts: 3, onFailed });
    const job = failedJob({ attemptsMade: 1, opts: { attempts: 3 } });

    await processor.onFailed(job);

    expect(onFailed).not.toHaveBeenCalled();
  });

  it('is a no-op when no onFailed handler is configured', async () => {
    const { processor } = makeProcessor();
    await expect(processor.onFailed(failedJob({}))).resolves.toBeUndefined();
  });

  it('swallows errors thrown by the onFailed handler', async () => {
    const onFailed = vi.fn().mockRejectedValue(new Error('handler blew up'));
    const { processor } = makeProcessor({ attempts: 1, onFailed });
    const job = failedJob({ attemptsMade: 1, opts: { attempts: 1 } });

    await expect(processor.onFailed(job)).resolves.toBeUndefined();
    expect(onFailed).toHaveBeenCalled();
  });
});
