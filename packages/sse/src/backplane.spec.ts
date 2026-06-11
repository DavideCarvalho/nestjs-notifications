import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { SseBackplane, SseBackplaneMessage } from './backplane';
import { type RedisPubSubClient, RedisSseBackplane } from './redis.backplane';
import { SseHub } from './sse.hub';

/** A fake in-test backplane that loops published messages straight back to the handler. */
class LoopbackBackplane implements SseBackplane {
  private handler?: (key: string, message: SseBackplaneMessage) => void;
  readonly published: Array<{ key: string; message: SseBackplaneMessage }> = [];

  publish(key: string, message: SseBackplaneMessage): void {
    this.published.push({ key, message });
    this.handler?.(key, message);
  }
  subscribe(handler: (key: string, message: SseBackplaneMessage) => void): void {
    this.handler = handler;
  }
}

describe('SseHub with a backplane', () => {
  it('routes publishes through the backplane and delivers them back to local subscribers', async () => {
    const backplane = new LoopbackBackplane();
    const hub = new SseHub(backplane);
    await hub.onModuleInit();

    const received = firstValueFrom(hub.stream('user.1').pipe(take(1)));
    hub.publish('user.1', { hello: 'world' }, { event: 'notification' });

    expect(backplane.published).toHaveLength(1);
    expect(backplane.published[0]?.key).toBe('user.1');
    const event = (await received) as MessageEvent;
    expect(event).toEqual({ data: { hello: 'world' }, type: 'notification' });
  });

  it('closes the backplane on module destroy', async () => {
    const backplane = new LoopbackBackplane() as LoopbackBackplane & { close: () => void };
    backplane.close = vi.fn();
    const hub = new SseHub(backplane);
    await hub.onModuleDestroy();
    expect(backplane.close).toHaveBeenCalledOnce();
  });
});

describe('RedisSseBackplane', () => {
  function fakeClient(): RedisPubSubClient & {
    emit: (channel: string, raw: string) => void;
    published: Array<[string, string]>;
  } {
    let listener: ((channel: string, message: string) => void) | undefined;
    return {
      published: [],
      publish(channel, message) {
        this.published.push([channel, message]);
      },
      subscribe() {},
      on(_event, cb) {
        listener = cb;
      },
      emit(channel, raw) {
        listener?.(channel, raw);
      },
    };
  }

  it('publishes JSON {key, message} on the channel', () => {
    const publisher = fakeClient();
    const subscriber = fakeClient();
    const bp = new RedisSseBackplane({ publisher, subscriber, channel: 'ch' });

    bp.publish('user.1', { data: { x: 1 }, event: 'notification' });

    expect(publisher.published[0]?.[0]).toBe('ch');
    expect(JSON.parse(publisher.published[0]?.[1] ?? '{}')).toEqual({
      key: 'user.1',
      message: { data: { x: 1 }, event: 'notification' },
    });
  });

  it('parses inbound messages on the channel and forwards to the handler', () => {
    const publisher = fakeClient();
    const subscriber = fakeClient();
    const bp = new RedisSseBackplane({ publisher, subscriber, channel: 'ch' });

    const handler = vi.fn();
    bp.subscribe(handler);
    subscriber.emit('ch', JSON.stringify({ key: 'user.9', message: { data: { y: 2 } } }));
    subscriber.emit('other', JSON.stringify({ key: 'nope', message: { data: {} } }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('user.9', { data: { y: 2 } });
  });
});
