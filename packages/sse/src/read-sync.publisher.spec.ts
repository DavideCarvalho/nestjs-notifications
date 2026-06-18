import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SSE_READ_EVENT, SseReadSyncPublisher } from './read-sync.publisher';
import { sseKey } from './sse-key';
import { SseHub } from './sse.hub';

describe('SseReadSyncPublisher', () => {
  it('publishes a read event under the notifiable stream key (other devices receive it)', async () => {
    const hub = new SseHub();
    const publisher = new SseReadSyncPublisher(hub);

    const received = firstValueFrom(hub.stream('42').pipe(take(1)));

    publisher.publishRead({
      ref: { type: 'User', id: '42' },
      notificationId: 'abc',
      readAt: '2026-06-17T00:00:00.000Z',
    });

    const event = (await received) as MessageEvent;
    expect(event).toEqual({
      data: { notificationId: 'abc', readAt: '2026-06-17T00:00:00.000Z' },
      type: SSE_READ_EVENT,
    });
  });

  it('routes to a tenant-prefixed key when the event carries a tenant', async () => {
    const hub = new SseHub();
    const publisher = new SseReadSyncPublisher(hub);

    const key = sseKey('acme', '42');
    const received = firstValueFrom(hub.stream(key).pipe(take(1)));

    publisher.publishRead({
      ref: { type: 'User', id: '42' },
      tenantId: 'acme',
      notificationId: null,
      readAt: '2026-06-17T01:00:00.000Z',
    });

    const event = (await received) as MessageEvent;
    expect(event.data).toEqual({ notificationId: null, readAt: '2026-06-17T01:00:00.000Z' });
  });
});
