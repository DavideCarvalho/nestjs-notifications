import type { NotificationJob, NotificationSerializer } from '@nestjs-notifications/core';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEY, type RedisDispatcherOptions } from './options';
import { RedisNotificationDispatcher } from './redis.dispatcher';

describe('RedisNotificationDispatcher', () => {
  const serialized = {
    notifiable: { type: 'User', id: 1 },
    notification: { name: 'Welcome', data: {} },
    channels: ['mail'],
  };
  const job: NotificationJob = {
    notifiable: {
      routeNotificationFor: () => 'a',
      toNotifiableRef: () => ({ type: 'User', id: 1 }),
    },
    notification: { via: () => ['mail'] },
    channels: ['mail'],
  };

  it('lpushes the JSON-serialized job onto the default key', async () => {
    const client = { lpush: vi.fn().mockResolvedValue(1) } as unknown as Redis;
    const serializer = {
      serialize: vi.fn().mockReturnValue(serialized),
    } as unknown as NotificationSerializer;
    const options: RedisDispatcherOptions = { connection: 'redis://localhost:6379' };

    const dispatcher = new RedisNotificationDispatcher(client, serializer, options);
    await dispatcher.dispatch(job);

    expect(serializer.serialize).toHaveBeenCalledWith(job);
    expect(client.lpush).toHaveBeenCalledWith(DEFAULT_KEY, JSON.stringify(serialized));
  });

  it('honors a custom key', async () => {
    const client = { lpush: vi.fn().mockResolvedValue(1) } as unknown as Redis;
    const serializer = {
      serialize: vi.fn().mockReturnValue(serialized),
    } as unknown as NotificationSerializer;
    const options: RedisDispatcherOptions = {
      connection: 'redis://localhost:6379',
      key: 'custom:jobs',
    };

    const dispatcher = new RedisNotificationDispatcher(client, serializer, options);
    await dispatcher.dispatch(job);

    expect(client.lpush).toHaveBeenCalledWith('custom:jobs', JSON.stringify(serialized));
  });
});
