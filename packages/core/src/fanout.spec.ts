import { Injectable } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type {
  ChannelDriver,
  DispatchDriver,
  Notifiable,
  Notification,
  NotificationJob,
} from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

const RECIPIENTS = 300;

const user = (id: number): Notifiable => ({
  routeNotificationFor: () => `u${id}@example.com`,
  toNotifiableRef: () => ({ type: 'User', id }),
});
const users = (): Notifiable[] => Array.from({ length: RECIPIENTS }, (_, i) => user(i));

class Welcome implements Notification {
  via(): string[] {
    return ['mail'];
  }
}

/** Tracks how many calls overlap; each call yields for a few ticks before finishing. */
class InFlight {
  current = 0;
  max = 0;
  async run(): Promise<void> {
    this.current++;
    this.max = Math.max(this.max, this.current);
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.current--;
  }
}

class SlowMail implements ChannelDriver {
  readonly channel = 'mail';
  readonly inFlight = new InFlight();
  readonly delivered: unknown[] = [];
  async send(notifiable: Notifiable): Promise<void> {
    await this.inFlight.run();
    this.delivered.push(notifiable.routeNotificationFor('mail', new Welcome()));
  }
}

const perJob = new InFlight();
const perJobDispatched: NotificationJob[] = [];

@Injectable()
class PerJobDispatcher implements DispatchDriver {
  async dispatch(job: NotificationJob): Promise<void> {
    await perJob.run();
    perJobDispatched.push(job);
  }
}

const batches: NotificationJob[][] = [];

@Injectable()
class BatchDispatcher implements DispatchDriver {
  async dispatch(): Promise<void> {
    throw new Error('dispatch() should not be called when dispatchMany() exists');
  }
  async dispatchMany(jobs: NotificationJob[]): Promise<void> {
    batches.push(jobs);
  }
}

async function bootstrap(dispatcher?: new (...args: never[]) => DispatchDriver) {
  const channel = new SlowMail();
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({ global: false, ...(dispatcher ? { dispatcher } : {}) }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return { service: moduleRef.get(NotificationService), channel };
}

describe('NotificationService fan-out', () => {
  it('bounds how many inline deliveries one send runs at once, keeping result order', async () => {
    const { service, channel } = await bootstrap();
    const results = await service.sendNow(users(), new Welcome());

    expect(channel.delivered).toHaveLength(RECIPIENTS);
    expect(channel.inFlight.max).toBeGreaterThan(1);
    expect(channel.inFlight.max).toBeLessThanOrEqual(50);
    expect(results.map((r) => r.notifiable.toNotifiableRef?.()?.id)).toEqual(
      users().map((_, i) => i),
    );
    expect(results.every((r) => r.results[0]?.status === 'sent')).toBe(true);
  });

  it('bounds concurrent dispatch() calls when the dispatcher has no dispatchMany()', async () => {
    const { service } = await bootstrap(PerJobDispatcher);
    const results = await service.sendAsync(users(), new Welcome());

    expect(perJobDispatched).toHaveLength(RECIPIENTS);
    expect(perJob.max).toBeLessThanOrEqual(50);
    expect(results.every((r) => r.results[0]?.status === 'queued')).toBe(true);
  });

  it('hands every job of one send to dispatchMany() in a single call, in recipient order', async () => {
    const { service } = await bootstrap(BatchDispatcher);
    const results = await service.sendAsync(users(), new Welcome());

    expect(batches).toHaveLength(1);
    expect(
      batches[0]?.map((job) => (job.notifiable as Notifiable).toNotifiableRef?.()?.id),
    ).toEqual(users().map((_, i) => i));
    expect(batches[0]?.[0]?.channels).toEqual(['mail']);
    expect(results.every((r) => r.results[0]?.status === 'queued')).toBe(true);
  });
});
