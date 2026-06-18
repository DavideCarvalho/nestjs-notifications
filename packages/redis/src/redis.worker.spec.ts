import { type ChannelRunner, NotificationSerializer } from '@dudousxd/nestjs-notifications-core';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEAD_LETTER_KEY,
  DEFAULT_KEY,
  DEFAULT_SCHEDULED_KEY,
  type RedisDispatcherOptions,
} from './options';
import { RedisNotificationWorker } from './redis.worker';

class WelcomeNotification {
  via() {
    return ['mail'];
  }
}

function serializer(): NotificationSerializer {
  return new NotificationSerializer({
    notifications: [WelcomeNotification],
    resolveNotifiable: (ref) => ({ toNotifiableRef: () => ref }),
  });
}

const job = {
  notifiable: { type: 'User', id: 1 },
  notification: { name: 'WelcomeNotification', data: {} },
  channels: ['mail'],
};

const options: RedisDispatcherOptions = { connection: 'redis://localhost:6379' };

/** Inject a fake ready/dead-letter connection without booting the real onModuleInit loops. */
function withConnection(worker: RedisNotificationWorker, connection: Redis): void {
  (worker as unknown as { connection: Redis }).connection = connection;
}

function callHandle(worker: RedisNotificationWorker, raw: string): Promise<void> {
  return (worker as unknown as { handle(raw: string): Promise<void> }).handle(raw);
}

describe('RedisNotificationWorker retry + dead-letter', () => {
  it('re-queues a failed job up to maxAttempts, then dead-letters it', async () => {
    const run = vi.fn().mockRejectedValue(new Error('delivery failed'));
    const lpush = vi.fn().mockResolvedValue(1);
    const connection = { lpush } as unknown as Redis;

    const worker = new RedisNotificationWorker(serializer(), { run } as unknown as ChannelRunner, {
      ...options,
      maxAttempts: 3,
    });
    withConnection(worker, connection);

    // attempt 1 → requeue with attempts:1
    await callHandle(worker, JSON.stringify(job));
    expect(lpush).toHaveBeenLastCalledWith(DEFAULT_KEY, expect.any(String));
    const requeued1 = JSON.parse(lpush.mock.calls.at(-1)?.[1] as string);
    expect(requeued1.attempts).toBe(1);

    // attempt 2 → requeue with attempts:2
    await callHandle(worker, JSON.stringify(requeued1));
    const requeued2 = JSON.parse(lpush.mock.calls.at(-1)?.[1] as string);
    expect(requeued2.attempts).toBe(2);

    // attempt 3 → dead-letter (no more retries)
    await callHandle(worker, JSON.stringify(requeued2));
    expect(lpush).toHaveBeenLastCalledWith(DEFAULT_DEAD_LETTER_KEY, expect.any(String));
    const dead = JSON.parse(lpush.mock.calls.at(-1)?.[1] as string);
    expect(dead.attempts).toBe(3);
  });

  it('dead-letters unparseable payloads immediately', async () => {
    const lpush = vi.fn().mockResolvedValue(1);
    const connection = { lpush } as unknown as Redis;
    const worker = new RedisNotificationWorker(
      serializer(),
      { run: vi.fn() } as unknown as ChannelRunner,
      options,
    );
    withConnection(worker, connection);

    await callHandle(worker, 'not json{');

    expect(lpush).toHaveBeenCalledWith(DEFAULT_DEAD_LETTER_KEY, 'not json{');
  });

  it('does not retry when delivery succeeds', async () => {
    const run = vi.fn().mockResolvedValue([]);
    const lpush = vi.fn().mockResolvedValue(1);
    const worker = new RedisNotificationWorker(
      serializer(),
      { run } as unknown as ChannelRunner,
      options,
    );
    withConnection(worker, { lpush } as unknown as Redis);

    await callHandle(worker, JSON.stringify(job));

    expect(run).toHaveBeenCalledOnce();
    expect(lpush).not.toHaveBeenCalled();
  });
});

describe('RedisNotificationWorker scheduled poller', () => {
  it('promotes due jobs from the sorted set onto the ready list (ZRANGEBYSCORE → LPUSH + ZREM)', async () => {
    const zrangebyscore = vi.fn().mockResolvedValue(['p1', 'p2']);
    const zrem = vi.fn().mockResolvedValue(1);
    const lpush = vi.fn().mockResolvedValue(1);
    const pollConn = { zrangebyscore, zrem, lpush } as unknown as Redis;

    const worker = new RedisNotificationWorker(
      serializer(),
      { run: vi.fn() } as unknown as ChannelRunner,
      options,
    );

    await worker.promoteDue(pollConn, 1000);

    expect(zrangebyscore).toHaveBeenCalledWith(DEFAULT_SCHEDULED_KEY, 0, 1000);
    expect(zrem).toHaveBeenCalledTimes(2);
    expect(lpush).toHaveBeenCalledWith(DEFAULT_KEY, 'p1');
    expect(lpush).toHaveBeenCalledWith(DEFAULT_KEY, 'p2');
  });

  it('does not re-push a job another worker already claimed (ZREM returned 0)', async () => {
    const zrangebyscore = vi.fn().mockResolvedValue(['p1']);
    const zrem = vi.fn().mockResolvedValue(0); // someone else removed it first
    const lpush = vi.fn().mockResolvedValue(1);
    const pollConn = { zrangebyscore, zrem, lpush } as unknown as Redis;

    const worker = new RedisNotificationWorker(
      serializer(),
      { run: vi.fn() } as unknown as ChannelRunner,
      options,
    );

    await worker.promoteDue(pollConn, 1000);

    expect(lpush).not.toHaveBeenCalled();
  });
});
