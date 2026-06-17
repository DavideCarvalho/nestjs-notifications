import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type { ContextAccessor, UserRef } from './context-accessor';
import { captureContext } from './context-accessor';
import { NotificationSentEvent } from './events';
import type { ChannelDriver, DeliveryContext, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';
import { CONTEXT_ACCESSOR, NotificationEvents } from './tokens';

class TestUser implements Notifiable {
  constructor(public id: number) {}
  toNotifiableRef() {
    return { type: 'TestUser', id: this.id };
  }
}

class WelcomeNotification implements Notification {
  via(): string[] {
    return ['mail'];
  }
}

/** Records the DeliveryContext threaded to the channel — that is where the capture lands. */
class RecordingChannel implements ChannelDriver {
  readonly channel = 'mail';
  contexts: DeliveryContext[] = [];
  async send(_n: Notifiable, _notif: Notification, context?: DeliveryContext): Promise<void> {
    this.contexts.push(context ?? {});
  }
}

/** Minimal fake nestjs-context accessor — structural match, no real package. */
function fakeAccessor(
  over: Partial<{ user: UserRef; tenant: string; trace: string }> = {},
): ContextAccessor {
  return {
    userRef: () => over.user,
    tenantId: () => over.tenant,
    traceId: () => over.trace,
    get: () => undefined,
  };
}

async function bootstrap(channel: ChannelDriver, accessor?: ContextAccessor) {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot({ global: false })],
    providers: accessor ? [{ provide: CONTEXT_ACCESSOR, useValue: accessor }] : [],
  }).compile();
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('captureContext()', () => {
  it('returns undefined when no accessor is present', () => {
    expect(captureContext(undefined)).toBeUndefined();
  });

  it('returns undefined when the accessor yields nothing', () => {
    expect(captureContext(fakeAccessor())).toBeUndefined();
  });

  it('snapshots causer/tenant/trace into a plain object', () => {
    const captured = captureContext(
      fakeAccessor({ user: { type: 'User', id: 7 }, tenant: 'acme', trace: 'trace-1' }),
    );
    expect(captured).toEqual({
      causer: { type: 'User', id: 7 },
      tenantId: 'acme',
      traceId: 'trace-1',
    });
  });

  it('swallows accessor errors (defensive)', () => {
    const throwing: ContextAccessor = {
      userRef: () => {
        throw new Error('boom');
      },
      tenantId: () => undefined,
      traceId: () => undefined,
      get: () => undefined,
    };
    expect(captureContext(throwing)).toBeUndefined();
  });
});

describe('NotificationService context capture', () => {
  it('captures causer/tenant/trace and threads it to the channel + sent event', async () => {
    const channel = new RecordingChannel();
    const accessor = fakeAccessor({ user: { type: 'User', id: 7 }, tenant: 'acme', trace: 'tx-9' });
    const moduleRef = await bootstrap(channel, accessor);

    const sentEvents: NotificationSentEvent[] = [];
    moduleRef
      .get(EventEmitter2)
      .on(NotificationEvents.sent, (e: NotificationSentEvent) => sentEvents.push(e));

    await moduleRef.get(NotificationService).send(new TestUser(7), new WelcomeNotification());

    // reached the channel via DeliveryContext.captured
    expect(channel.contexts[0]?.captured).toEqual({
      causer: { type: 'User', id: 7 },
      tenantId: 'acme',
      traceId: 'tx-9',
    });
    // reached the lifecycle event
    expect(sentEvents[0]?.captured).toEqual({
      causer: { type: 'User', id: 7 },
      tenantId: 'acme',
      traceId: 'tx-9',
    });
  });

  it('is unchanged when no accessor is bound (captured is undefined)', async () => {
    const channel = new RecordingChannel();
    const moduleRef = await bootstrap(channel);

    await moduleRef.get(NotificationService).send(new TestUser(1), new WelcomeNotification());

    expect(channel.contexts).toHaveLength(1);
    expect(channel.contexts[0]?.captured).toBeUndefined();
  });
});
