import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type {
  ChannelDriver,
  DigestSink,
  GateDecision,
  Notifiable,
  Notification,
  PreferenceGate,
} from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';
import { NOTIFICATION_DIGEST_SINK, NOTIFICATION_PREFERENCE_GATE } from './tokens';

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

async function bootstrap(channel: ChannelDriver, gate: PreferenceGate, sink?: DigestSink) {
  const providers = [{ provide: NOTIFICATION_PREFERENCE_GATE, useValue: gate }];
  if (sink) providers.push({ provide: NOTIFICATION_DIGEST_SINK, useValue: sink });
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({ global: false, providers }),
    ],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('ChannelRunner gate digest', () => {
  let channel: RecordingChannel;

  beforeEach(() => {
    channel = new RecordingChannel();
  });

  it('forwards a skip+digest decision to the bound DigestSink and reports skipped', async () => {
    const collect = vi.fn(async () => {});
    const sink: DigestSink = { collect };
    const evaluate = vi.fn(
      async (): Promise<GateDecision> => ({
        action: 'skip',
        digest: { cadence: 'daily', category: 'billing' },
      }),
    );
    const gate: PreferenceGate = { isAllowed: () => false, evaluate };
    const moduleRef = await bootstrap(channel, gate, sink);

    const user = new TestUser(1);
    const notification = new Welcome();
    const [result] = await moduleRef.get(NotificationService).send(user, notification);

    // The channel is NOT delivered instantly; it is recorded as skipped.
    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'skipped' }),
    ]);
    expect(channel.sent).toHaveLength(0);
    // But the notification was COLLECTED into the digest sink (not lost).
    expect(collect).toHaveBeenCalledTimes(1);
    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({
        notifiable: user,
        notification,
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      }),
    );
  });

  it('drops (does not collect) a plain skip with no digest cadence', async () => {
    const collect = vi.fn(async () => {});
    const sink: DigestSink = { collect };
    const gate: PreferenceGate = { isAllowed: () => false };
    const moduleRef = await bootstrap(channel, gate, sink);

    const [result] = await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());

    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'skipped' }),
    ]);
    expect(collect).not.toHaveBeenCalled();
  });

  it('falls back to dropping when a digest skip has no sink bound', async () => {
    const evaluate = vi.fn(
      async (): Promise<GateDecision> => ({
        action: 'skip',
        digest: { cadence: 'weekly', category: 'social' },
      }),
    );
    const gate: PreferenceGate = { isAllowed: () => false, evaluate };
    const moduleRef = await bootstrap(channel, gate);

    const [result] = await moduleRef.get(NotificationService).send(new TestUser(1), new Welcome());

    expect(result?.results).toEqual([
      expect.objectContaining({ channel: 'mail', status: 'skipped' }),
    ]);
    expect(channel.sent).toHaveLength(0);
  });
});
