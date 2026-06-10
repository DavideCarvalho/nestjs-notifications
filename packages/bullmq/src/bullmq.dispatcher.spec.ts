import type { NotificationJob, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BullmqNotificationDispatcher } from './bullmq.dispatcher';

describe('BullmqNotificationDispatcher', () => {
  it('serializes the job and enqueues it with retry/backoff options', async () => {
    const serialized = {
      notifiable: { type: 'User', id: 1 },
      notification: { name: 'Welcome', data: {} },
      channels: ['mail'],
    };
    const queue = { add: vi.fn().mockResolvedValue(undefined) } as unknown as Queue;
    const serializer = {
      serialize: vi.fn().mockReturnValue(serialized),
    } as unknown as NotificationSerializer;

    const dispatcher = new BullmqNotificationDispatcher(queue, serializer);

    const job: NotificationJob = {
      notifiable: {
        routeNotificationFor: () => 'a',
        toNotifiableRef: () => ({ type: 'User', id: 1 }),
      },
      notification: { via: () => ['mail'] },
      channels: ['mail'],
    };
    await dispatcher.dispatch(job);

    expect(serializer.serialize).toHaveBeenCalledWith(job);
    expect(queue.add).toHaveBeenCalledWith('send', serialized, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  });
});
