import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type { DispatchGuardOptions } from './dispatch-guards';
import type { ChannelDriver, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

class TestUser implements Notifiable {
  constructor(public id: number) {}
  routeNotificationFor(): unknown {
    return `user-${this.id}`;
  }
  toNotifiableRef() {
    return { type: 'TestUser', id: this.id };
  }
}

class RecordingChannel implements ChannelDriver {
  readonly channel = 'mail';
  count = 0;
  async send(): Promise<void> {
    this.count += 1;
  }
}

async function bootstrap(channel: ChannelDriver, dispatchGuards?: DispatchGuardOptions) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({ global: false, dispatchGuards }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('dispatch guards — idempotency', () => {
  let channel: RecordingChannel;
  beforeEach(() => {
    channel = new RecordingChannel();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  class DedupNotification implements Notification {
    constructor(private readonly key: string) {}
    via(): string[] {
      return ['mail'];
    }
    idempotencyKey(): string {
      return this.key;
    }
    idempotencyTtlMs = 1000;
    toMail() {
      return {};
    }
  }

  it('delivers once for the same key within the window', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    const user = new TestUser(1);

    await service.send(user, new DedupNotification('order-42'));
    const [second] = await service.send(user, new DedupNotification('order-42'));

    expect(channel.count).toBe(1);
    expect(second.results[0]).toMatchObject({ channel: 'mail', status: 'suppressed' });
  });

  it('delivers both for different keys', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    const user = new TestUser(1);

    await service.send(user, new DedupNotification('a'));
    await service.send(user, new DedupNotification('b'));

    expect(channel.count).toBe(2);
  });

  it('delivers again after the window expires', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    const user = new TestUser(1);

    await service.send(user, new DedupNotification('order-42'));
    vi.advanceTimersByTime(1001);
    await service.send(user, new DedupNotification('order-42'));

    expect(channel.count).toBe(2);
  });

  it('scopes per-notifiable: same key still delivers to a different user', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.send(new TestUser(1), new DedupNotification('k'));
    await service.send(new TestUser(2), new DedupNotification('k'));

    expect(channel.count).toBe(2);
  });
});

describe('dispatch guards — throttle', () => {
  let channel: RecordingChannel;
  beforeEach(() => {
    channel = new RecordingChannel();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  class ThrottledNotification implements Notification {
    via(): string[] {
      return ['mail'];
    }
    throttle() {
      return { max: 2, windowMs: 1000, category: 'marketing' as const };
    }
    toMail() {
      return {};
    }
  }

  it('passes within the limit and drops the excess', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    const user = new TestUser(1);

    await service.send(user, new ThrottledNotification());
    await service.send(user, new ThrottledNotification());
    const [third] = await service.send(user, new ThrottledNotification());

    expect(channel.count).toBe(2);
    expect(third.results[0]).toMatchObject({ channel: 'mail', status: 'throttled' });
  });

  it('resets after the window', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    const user = new TestUser(1);

    await service.send(user, new ThrottledNotification());
    await service.send(user, new ThrottledNotification());
    vi.advanceTimersByTime(1001);
    await service.send(user, new ThrottledNotification());

    expect(channel.count).toBe(3);
  });
});

describe('dispatch guards — backwards compatible', () => {
  it('delivers normally when the notification declares no guards', async () => {
    const channel = new RecordingChannel();
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    class Plain implements Notification {
      via(): string[] {
        return ['mail'];
      }
      toMail() {
        return {};
      }
    }

    await service.send(new TestUser(1), new Plain());
    await service.send(new TestUser(1), new Plain());
    expect(channel.count).toBe(2);
  });
});
