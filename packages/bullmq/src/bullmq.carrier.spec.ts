import {
  type CapturedContext,
  type ChannelRunner,
  NotificationSerializer,
} from '@dudousxd/nestjs-notifications-core';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { BullmqNotificationDispatcher } from './bullmq.dispatcher';
import { BullmqNotificationProcessor } from './bullmq.processor';

const captured: CapturedContext = {
  causer: { type: 'User', id: 7 },
  tenantId: 'acme',
  traceId: 'tx-9',
};

class WelcomeNotification {
  via() {
    return ['mail'];
  }
}

/** Build a real serializer wired to rehydrate WelcomeNotification + reload the notifiable. */
function realSerializer(): NotificationSerializer {
  return new NotificationSerializer({
    notifications: [WelcomeNotification],
    resolveNotifiable: (ref) => ({ toNotifiableRef: () => ref }),
  });
}

describe('BullMQ captured-context carrier', () => {
  it('carries the captured context through enqueue → consume', async () => {
    const serializer = realSerializer();

    // enqueue: capture the payload the dispatcher would push to Redis.
    let enqueued: unknown;
    const queue = {
      add: vi.fn((_name: string, payload: unknown) => {
        enqueued = payload;
        return Promise.resolve();
      }),
    };
    const dispatcher = new BullmqNotificationDispatcher(queue as never, serializer);

    await dispatcher.dispatch({
      notifiable: { toNotifiableRef: () => ({ type: 'User', id: 7 }) },
      notification: new WelcomeNotification(),
      channels: ['mail'],
      tenant: 'acme',
      captured,
    });

    // round-trip through JSON, as Redis would.
    const wire = JSON.parse(JSON.stringify(enqueued)) as { captured?: CapturedContext };
    expect(wire.captured).toEqual(captured);

    // consume: the processor must re-establish captured on the runner context.
    const run = vi.fn().mockResolvedValue([]);
    const processor = new BullmqNotificationProcessor(serializer, {
      run,
    } as unknown as ChannelRunner);

    await processor.process({ data: wire } as Job);

    expect(run).toHaveBeenCalledTimes(1);
    const context = run.mock.calls[0]?.[3];
    expect(context).toMatchObject({ tenant: 'acme', captured });
  });
});
