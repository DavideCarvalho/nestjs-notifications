import type { NotificationJob, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BullmqNotificationDispatcher } from './bullmq.dispatcher';
import type { BullmqDispatcherOptions } from './options';

const serialized = {
  notifiable: { type: 'User', id: 1 },
  notification: { name: 'Welcome', data: {} },
  channels: ['mail'],
};

function makeDeps(options?: BullmqDispatcherOptions) {
  const queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
  const serializer = {
    serialize: vi.fn().mockReturnValue(serialized),
  } as unknown as NotificationSerializer;
  const dispatcher = new BullmqNotificationDispatcher(queue, serializer, options);
  return { queue, serializer, dispatcher };
}

const job: NotificationJob = {
  notifiable: {
    routeNotificationFor: () => 'a',
    toNotifiableRef: () => ({ type: 'User', id: 1 }),
  },
  notification: { via: () => ['mail'] },
  channels: ['mail'],
};

describe('BullmqNotificationDispatcher', () => {
  it('serializes the job and enqueues it with default retry/backoff options', async () => {
    const { queue, serializer, dispatcher } = makeDeps();

    await dispatcher.dispatch(job);

    expect(serializer.serialize).toHaveBeenCalledWith(job);
    expect(queue.add).toHaveBeenCalledWith('send', serialized, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  });

  it('applies configured attempts/backoff/removeOnComplete/removeOnFail', async () => {
    const { queue, dispatcher } = makeDeps({
      attempts: 5,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });

    await dispatcher.dispatch(job);

    expect(queue.add).toHaveBeenCalledWith('send', serialized, {
      attempts: 5,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  });

  it('leaves defaults unchanged for unspecified options', async () => {
    const { queue, dispatcher } = makeDeps({ removeOnComplete: true });

    await dispatcher.dispatch(job);

    expect(queue.add).toHaveBeenCalledWith('send', serialized, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
    });
  });

  it('preserves scheduled delay alongside configured options', async () => {
    const { queue, dispatcher } = makeDeps({ attempts: 2 });

    await dispatcher.dispatch({ ...job, delay: 5000 });

    expect(queue.add).toHaveBeenCalledWith('send', serialized, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
      delay: 5000,
    });
  });
});
