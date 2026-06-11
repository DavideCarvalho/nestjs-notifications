import type { Notifiable } from '@dudousxd/nestjs-notifications-core';
import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { sseKey } from './sse-key';
import { SseChannel } from './sse.channel';
import type { SseNotification } from './sse.channel';
import { SseHub } from './sse.hub';

class TestUser implements Notifiable {
  constructor(public id: string) {}
  routeNotificationFor(): unknown {
    return this.id;
  }
}

class InvoicePaid implements SseNotification {
  via(): string[] {
    return ['sse'];
  }
  toSse(): Record<string, unknown> {
    return { invoice: 42, amount: 100 };
  }
}

describe('SseChannel', () => {
  it('publishes to the hub under the routed key and a subscriber receives it', async () => {
    const hub = new SseHub();
    const channel = new SseChannel(hub, { event: 'notification' });

    const received = firstValueFrom(hub.stream('user.1').pipe(take(1)));

    await channel.send(new TestUser('user.1'), new InvoicePaid());

    const event = (await received) as MessageEvent;
    expect(event).toEqual({ data: { invoice: 42, amount: 100 }, type: 'notification' });
  });

  it('isolates streams per tenant via a tenant-prefixed key', async () => {
    const hub = new SseHub();
    const channel = new SseChannel(hub, {});

    const key = sseKey('acme', 'user.1');
    expect(key).toBe('acme:user.1');

    const received = firstValueFrom(hub.stream(key).pipe(take(1)));

    await channel.send(new TestUser('user.1'), new InvoicePaid(), { tenant: 'acme' });

    const event = (await received) as MessageEvent;
    expect(event.data).toEqual({ invoice: 42, amount: 100 });

    // The non-tenant key never received anything.
    let leaked = false;
    const sub = hub.stream('user.1').subscribe(() => {
      leaked = true;
    });
    await channel.send(new TestUser('user.1'), new InvoicePaid(), { tenant: 'acme' });
    sub.unsubscribe();
    expect(leaked).toBe(false);
  });

  it('falls back to toArray then a structural copy when toSse is absent', async () => {
    const hub = new SseHub();
    const channel = new SseChannel(hub, { event: 'notification' });

    class WithArray implements SseNotification {
      via(): string[] {
        return ['sse'];
      }
      toArray(): Record<string, unknown> {
        return { kind: 'array' };
      }
    }

    const received = firstValueFrom(hub.stream('room').pipe(take(1)));
    await channel.send(new TestUser('room'), new WithArray());
    const event = (await received) as MessageEvent;
    expect(event.data).toEqual({ kind: 'array' });
  });
});
