import {
  type CapturedContext,
  type ChannelRunner,
  NotificationSerializer,
} from '@dudousxd/nestjs-notifications-core';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEY } from './options';
import { RedisNotificationDispatcher } from './redis.dispatcher';
import { RedisNotificationWorker } from './redis.worker';

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

function realSerializer(): NotificationSerializer {
  return new NotificationSerializer({
    notifications: [WelcomeNotification],
    resolveNotifiable: (ref) => ({ toNotifiableRef: () => ref }),
  });
}

describe('Redis captured-context carrier', () => {
  it('carries the captured context through lpush → worker consume', async () => {
    const serializer = realSerializer();

    // enqueue: capture what would be pushed onto the Redis list.
    let pushed = '';
    const client = {
      lpush: vi.fn((_key: string, payload: string) => {
        pushed = payload;
        return Promise.resolve(1);
      }),
    } as unknown as Redis;
    const options = { connection: 'redis://localhost:6379' };

    const dispatcher = new RedisNotificationDispatcher(client, serializer, options);
    await dispatcher.dispatch({
      notifiable: { toNotifiableRef: () => ({ type: 'User', id: 7 }) },
      notification: new WelcomeNotification(),
      channels: ['mail'],
      tenant: 'acme',
      captured,
    });

    expect(client.lpush).toHaveBeenCalledWith(DEFAULT_KEY, expect.any(String));
    expect((JSON.parse(pushed) as { captured?: CapturedContext }).captured).toEqual(captured);

    // consume: the worker re-establishes captured on the runner context.
    const run = vi.fn().mockResolvedValue([]);
    const worker = new RedisNotificationWorker(
      serializer,
      { run } as unknown as ChannelRunner,
      options,
    );

    // exercise the worker's consume path directly with the raw JSON the list holds.
    await (worker as unknown as { handle(raw: string): Promise<void> }).handle(pushed);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[3]).toMatchObject({ tenant: 'acme', captured });
  });
});
