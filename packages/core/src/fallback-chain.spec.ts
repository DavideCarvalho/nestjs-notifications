import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import { type DeliveryConfirmation, deliveredFromResult, runFallbackChain } from './fallback-chain';
import type { ChannelDriver, FallbackPolicy, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';
import { NOTIFICATION_DELIVERY_CONFIRMATION } from './tokens';

class TestUser implements Notifiable {
  constructor(public id: number) {}
  routeNotificationFor(): unknown {
    return 'addr';
  }
  toNotifiableRef() {
    return { type: 'TestUser', id: this.id };
  }
}

/** A channel that succeeds or throws based on its name being in `failing`. */
function makeChannel(name: string, failing: Set<string>): ChannelDriver {
  return {
    channel: name,
    send: vi.fn(async () => {
      if (failing.has(name)) throw new Error(`${name} down`);
      return `${name}-ok`;
    }),
  };
}

class Escalating implements Notification {
  constructor(private readonly policy: FallbackPolicy) {}
  via(): string[] {
    return this.policy.channels;
  }
  fallback(): FallbackPolicy {
    return this.policy;
  }
}

async function bootstrap(channels: ChannelDriver[], confirmation?: DeliveryConfirmation) {
  const providers = confirmation
    ? [{ provide: NOTIFICATION_DELIVERY_CONFIRMATION, useValue: confirmation }]
    : [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot({ global: false, providers }),
    ],
  }).compile();
  const registry = moduleRef.get(ChannelRegistry);
  for (const c of channels) registry.register(c);
  await moduleRef.init();
  return moduleRef;
}

describe('runFallbackChain (unit)', () => {
  it('stops at the first delivered channel', async () => {
    const deliver = vi.fn(async (channel: string) => ({ channel, status: 'sent' as const }));
    const result = await runFallbackChain(['push', 'sms', 'mail'], deliver, deliveredFromResult);
    expect(result.deliveredVia).toBe('push');
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
  });

  it('escalates past undelivered channels', async () => {
    const deliver = vi.fn(async (channel: string) => ({
      channel,
      status: channel === 'mail' ? ('sent' as const) : ('failed' as const),
    }));
    const result = await runFallbackChain(['push', 'sms', 'mail'], deliver, deliveredFromResult);
    expect(result.deliveredVia).toBe('mail');
    expect(deliver).toHaveBeenCalledTimes(3);
  });

  it('returns no deliveredVia when every channel fails', async () => {
    const deliver = vi.fn(async (channel: string) => ({ channel, status: 'failed' as const }));
    const result = await runFallbackChain(['push', 'sms'], deliver, deliveredFromResult);
    expect(result.deliveredVia).toBeUndefined();
    expect(result.results).toHaveLength(2);
  });
});

describe('NotificationService fallback chains', () => {
  let failing: Set<string>;

  beforeEach(() => {
    failing = new Set();
  });

  it('tries the next channel when the first fails, success stops the chain', async () => {
    failing.add('push'); // push fails → escalate to sms (succeeds)
    const push = makeChannel('push', failing);
    const sms = makeChannel('sms', failing);
    const mail = makeChannel('mail', failing);
    const moduleRef = await bootstrap([push, sms, mail]);

    const [result] = await moduleRef
      .get(NotificationService)
      .send(new TestUser(1), new Escalating({ channels: ['push', 'sms', 'mail'] }));

    expect(push.send).toHaveBeenCalledOnce();
    expect(sms.send).toHaveBeenCalledOnce();
    // mail is never attempted because sms succeeded.
    expect(mail.send).not.toHaveBeenCalled();
    expect(result?.results.map((r) => [r.channel, r.status])).toEqual([
      ['push', 'failed'],
      ['sms', 'sent'],
    ]);
  });

  it('delivers only the first channel when it succeeds', async () => {
    const push = makeChannel('push', failing);
    const sms = makeChannel('sms', failing);
    const moduleRef = await bootstrap([push, sms]);

    const [result] = await moduleRef
      .get(NotificationService)
      .send(new TestUser(1), new Escalating({ channels: ['push', 'sms'] }));

    expect(push.send).toHaveBeenCalledOnce();
    expect(sms.send).not.toHaveBeenCalled();
    expect(result?.results).toEqual([expect.objectContaining({ channel: 'push', status: 'sent' })]);
  });

  it('uses a DeliveryConfirmation probe to escalate a "sent but not delivered" channel', async () => {
    const push = makeChannel('push', failing); // sends OK but probe says undelivered
    const sms = makeChannel('sms', failing);
    const confirmation: DeliveryConfirmation = {
      confirm: ({ channel }) => channel !== 'push', // push never confirmed → escalate
    };
    const moduleRef = await bootstrap([push, sms], confirmation);

    const [result] = await moduleRef
      .get(NotificationService)
      .send(new TestUser(1), new Escalating({ channels: ['push', 'sms'], timeoutMs: 100 }));

    expect(push.send).toHaveBeenCalledOnce();
    expect(sms.send).toHaveBeenCalledOnce();
    expect(result?.results.map((r) => r.channel)).toEqual(['push', 'sms']);
  });
});
