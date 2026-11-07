import { Injectable, Module } from '@nestjs/common';
import {
  InMemoryOutboxStore,
  type OutboxHandlerContext,
  OutboxModule,
  OutboxStorage,
} from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ChannelRegistry } from '../channel-registry';
import type { ChannelDriver, Notifiable } from '../interfaces';
import { NotificationService } from '../notification.service';
import { NotificationsModule } from '../notifications.module';
import type { NotificationsModuleOptions } from '../options';
import { OutboxNotificationHandler, outboxDispatcher } from '../outbox';
import type { SerializedJob } from '../serializer';

class User implements Notifiable {
  constructor(readonly id: number) {}
  routeNotificationFor(): unknown {
    return `user-${this.id}`;
  }
  toNotifiableRef() {
    return { type: 'User', id: this.id };
  }
}

class OrderShipped {
  constructor(readonly orderId = 0) {}
  via(): string[] {
    return ['a', 'b'];
  }
}

/** A channel that records its sends and fails while `failuresLeft` is above zero. */
class FlakyChannel implements ChannelDriver {
  readonly sends: number[] = [];
  constructor(
    readonly channel: string,
    public failuresLeft = 0,
  ) {}
  async send(_notifiable: Notifiable, notification: unknown) {
    this.sends.push((notification as OrderShipped).orderId);
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error(`${this.channel} is down`);
    }
    return { ok: true };
  }
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

/** An app ("process") over `store`, the way a database-backed outbox store is shared. */
async function startApp(
  store: InMemoryOutboxStore,
  channels: ChannelDriver[],
  options: { errorPolicy?: NotificationsModuleOptions['errorPolicy']; retryDelay?: number } = {},
) {
  @Injectable()
  class SharedStore {
    constructor(storage: OutboxStorage) {
      storage.registerSource({ messages: store, inbox: store });
    }
  }
  @Module({ providers: [SharedStore] })
  class SharedStoreModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [
      OutboxModule.forRoot({
        relay: { pollInterval: 10 },
        retry: { attempts: 5, backoff: { delay: options.retryDelay ?? 20, jitter: 'none' } },
      }),
      SharedStoreModule,
      NotificationsModule.forRoot({
        emitter: true,
        ...(options.errorPolicy ? { errorPolicy: options.errorPolicy } : {}),
        ...outboxDispatcher({ transaction: (work) => store.transaction(work) }),
        notifications: [OrderShipped],
        resolveNotifiable: (ref) => new User(Number(ref.id)),
      }),
    ],
  }).compile();
  for (const channel of channels) moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  apps.push(moduleRef);
  return { moduleRef, notifications: moduleRef.get(NotificationService) };
}

const apps: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('outbox redelivery runs only the channels that have not completed', () => {
  it('failFast: channel b fails, the redelivery runs b alone and a is not repeated', async () => {
    const store = new InMemoryOutboxStore();
    const a = new FlakyChannel('a');
    const b = new FlakyChannel('b', 1);
    const { notifications } = await startApp(store, [a, b], { errorPolicy: 'failFast' });

    await notifications.sendAsync(new User(1), new OrderShipped(7));

    await waitFor(() => b.sends.length === 2);
    await waitFor(() => store.stats(Date.now()).pending === 0);
    await settle();
    expect(a.sends).toEqual([7]);
    expect(b.sends).toEqual([7, 7]);
  });

  it('failFast: after a restart, a new app sharing the store still skips the completed channel', async () => {
    const store = new InMemoryOutboxStore();
    const a1 = new FlakyChannel('a');
    const b1 = new FlakyChannel('b', 1);
    // A long retry delay, so the first app stops before the retry.
    const first = await startApp(store, [a1, b1], { errorPolicy: 'failFast', retryDelay: 300 });
    await first.notifications.sendAsync(new User(2), new OrderShipped(8));
    await waitFor(() => b1.sends.length === 1);
    await settle(50);
    await first.moduleRef.close();
    expect(a1.sends).toEqual([8]);
    expect(store.stats(Date.now() + 1_000).pending).toBe(1);

    const a2 = new FlakyChannel('a');
    const b2 = new FlakyChannel('b');
    await startApp(store, [a2, b2], { errorPolicy: 'failFast' });
    await waitFor(() => b2.sends.length === 1, 3000);
    await waitFor(() => store.stats(Date.now()).pending === 0);
    await settle();
    expect(a2.sends).toEqual([]);
    expect(b2.sends).toEqual([8]);
  });

  it('continueOnError: a failed channel is reported, not retried; a redelivery (crash, lost lease) reruns only it', async () => {
    const store = new InMemoryOutboxStore();
    const a = new FlakyChannel('a');
    const b = new FlakyChannel('b', 1);
    const { moduleRef, notifications } = await startApp(store, [a, b]);
    const added: { id: string; payload: SerializedJob }[] = [];
    const add = store.add.bind(store);
    store.add = (tx, messages) => {
      added.push(...messages.map((m) => ({ id: m.id, payload: m.payload as SerializedJob })));
      return add(tx, messages);
    };

    await notifications.sendAsync(new User(3), new OrderShipped(9));
    await waitFor(() => store.stats(Date.now()).pending === 0 && b.sends.length === 1);
    await settle();
    // The message is handled: the outbox doesn't retry the failed channel.
    expect(a.sends).toEqual([9]);
    expect(b.sends).toEqual([9]);

    // A redelivery of the same message (the relay lost its lease, or the process crashed
    // before the message was marked published) skips the channel that completed.
    const [message] = added;
    if (!message) throw new Error('no outbox message');
    const delivery = `${message.id}:User#3`;
    expect(store.hasInbox('aviary.notifications:a', delivery)).toBe(true);
    expect(store.hasInbox('aviary.notifications:b', delivery)).toBe(false);
    const context = { message: { id: message.id } } as unknown as OutboxHandlerContext;
    await moduleRef.get(OutboxNotificationHandler).handle(message.payload, context);
    expect(a.sends).toEqual([9]);
    expect(b.sends).toEqual([9, 9]);
  });
});
