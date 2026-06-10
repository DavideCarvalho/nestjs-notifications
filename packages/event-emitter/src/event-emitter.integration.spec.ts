import {
  type ChannelDriver,
  ChannelRegistry,
  type Notifiable,
  type Notification,
  NotificationService,
  NotificationsModule,
} from '@nestjs-notifications/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { EventEmitterDispatcher } from './event-emitter.dispatcher';

class User implements Notifiable {
  constructor(public email: string) {}
  routeNotificationFor() {
    return this.email;
  }
}

class Ping implements Notification {
  via() {
    return ['mail'];
  }
}

class Recorder implements ChannelDriver {
  readonly channel = 'mail';
  readonly sent: Notifiable[] = [];
  async send(notifiable: Notifiable): Promise<void> {
    this.sent.push(notifiable);
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for async delivery');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('EventEmitterDispatcher (integration, real DI)', () => {
  it('delivers asynchronously through the in-process dispatcher', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        NotificationsModule.forRoot({ dispatcher: EventEmitterDispatcher, global: false }),
      ],
    }).compile();

    const recorder = new Recorder();
    moduleRef.get(ChannelRegistry).register(recorder);
    await moduleRef.init();

    const service = moduleRef.get(NotificationService);
    await service.sendAsync(new User('async@x.com'), new Ping());

    // dispatch is fire-and-forget; the @OnEvent handler runs on a later tick.
    expect(recorder.sent).toHaveLength(0);
    await waitFor(() => recorder.sent.length === 1);
    expect((recorder.sent[0] as User).email).toBe('async@x.com');
  });
});
