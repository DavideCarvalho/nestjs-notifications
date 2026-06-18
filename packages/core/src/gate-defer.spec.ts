import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type {
  ChannelDriver,
  GateDecision,
  Notifiable,
  Notification,
  PreferenceGate,
} from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';
import { NOTIFICATION_PREFERENCE_GATE } from './tokens';

class TestUser implements Notifiable {
  constructor(public id: number) {}
  routeNotificationFor(): unknown {
    return 'addr';
  }
  toNotifiableRef() {
    return { type: 'TestUser', id: this.id };
  }
}

class RecordingChannel implements ChannelDriver {
  readonly channel = 'mail';
  readonly sent: Notifiable[] = [];
  async send(notifiable: Notifiable): Promise<void> {
    this.sent.push(notifiable);
  }
}

class Welcome implements Notification {
  via(): string[] {
    return ['mail'];
  }
}

async function bootstrap(channel: ChannelDriver, gate: PreferenceGate) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({
        global: false,
        providers: [{ provide: NOTIFICATION_PREFERENCE_GATE, useValue: gate }],
      }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('ChannelRunner gate defer', () => {
  let channel: RecordingChannel;

  beforeEach(() => {
    channel = new RecordingChannel();
  });

  it('falls back to isAllowed for a boolean-only gate (allow)', async () => {
    const gate: PreferenceGate = { isAllowed: () => true };
    const moduleRef = await bootstrap(channel, gate);
    const [result] = await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());
    expect(result?.results).toEqual([expect.objectContaining({ channel: 'mail', status: 'sent' })]);
    expect(channel.sent).toHaveLength(1);
  });

  it('falls back to isAllowed for a boolean-only gate (skip)', async () => {
    const gate: PreferenceGate = { isAllowed: () => false };
    const moduleRef = await bootstrap(channel, gate);
    const [result] = await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());
    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'skipped' }),
    ]);
    expect(channel.sent).toHaveLength(0);
  });

  it('defers and re-queues a channel when evaluate returns defer', async () => {
    const evaluate = vi.fn(
      async (): Promise<GateDecision> => ({ action: 'defer', deferUntil: Date.now() + 5_000 }),
    );
    const gate: PreferenceGate = { isAllowed: () => true, evaluate };
    const moduleRef = await bootstrap(channel, gate);

    const [result] = await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());

    // The initial send is recorded as deferred, not delivered.
    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'deferred' }),
    ]);
    // The re-queue runs via the sync dispatcher (inline), bypassing the gate the 2nd time,
    // so the channel is actually delivered exactly once.
    expect(channel.sent).toHaveLength(1);
  });

  it('does not loop: the re-queued delivery bypasses the gate', async () => {
    // A gate that ALWAYS defers — without bypass this would loop forever.
    const evaluate = vi.fn(async (): Promise<GateDecision> => ({ action: 'defer' }));
    const gate: PreferenceGate = { isAllowed: () => true, evaluate };
    const moduleRef = await bootstrap(channel, gate);

    await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());

    // Gate consulted once for the initial send; the re-queued delivery bypasses it.
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(channel.sent).toHaveLength(1);
  });
});
