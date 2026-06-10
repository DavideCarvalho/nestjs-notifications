import {
  type Notifiable,
  type Notification,
  NotificationEvents,
  NotificationFailedEvent,
  NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsWatcher } from './notifications.watcher';

class User implements Notifiable {
  constructor(public id: number) {}
  routeNotificationFor() {
    return undefined;
  }
  toNotifiableRef() {
    return { type: 'User', id: this.id };
  }
}

class InvoicePaid implements Notification {
  constructor(public invoiceId = 42) {}
  via() {
    return ['mail'];
  }
}

function makeCtx(emitter: EventEmitter2) {
  const record = vi.fn();
  const ctx = {
    record,
    runInBatch: vi.fn(),
    beginBatch: vi.fn(),
    config: {} as never,
    moduleRef: { get: () => emitter } as never,
  };
  return { ctx, record };
}

describe('NotificationsWatcher', () => {
  it('records a "sent" entry from the notification.sent event', () => {
    const emitter = new EventEmitter2();
    const { ctx, record } = makeCtx(emitter);
    new NotificationsWatcher().register(ctx);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(new User(1), new InvoicePaid(7), 'mail'),
    );

    expect(record).toHaveBeenCalledOnce();
    const input = record.mock.calls[0]?.[0];
    expect(input.type).toBe('notification');
    expect(input.familyHash).toBe('mail:InvoicePaid');
    expect(input.tags).toEqual(['channel:mail', 'notification:InvoicePaid']);
    expect(input.content).toMatchObject({
      channel: 'mail',
      notifiable: 'User#1',
      notificationClass: 'InvoicePaid',
      status: 'sent',
      payload: { invoiceId: 7 },
      failureReason: null,
    });
  });

  it('records a "failed" entry with the failure reason and a failed tag', () => {
    const emitter = new EventEmitter2();
    const { ctx, record } = makeCtx(emitter);
    new NotificationsWatcher().register(ctx);

    emitter.emit(
      NotificationEvents.failed,
      new NotificationFailedEvent(new User(2), new InvoicePaid(), 'mail', new Error('smtp down')),
    );

    const input = record.mock.calls[0]?.[0];
    expect(input.tags).toContain('failed');
    expect(input.content.status).toBe('failed');
    expect(input.content.failureReason).toBe('smtp down');
  });

  it('omits the payload when recordPayload is false', () => {
    const emitter = new EventEmitter2();
    const { ctx, record } = makeCtx(emitter);
    new NotificationsWatcher({ recordPayload: false }).register(ctx);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(new User(1), new InvoicePaid(), 'mail'),
    );

    expect(record.mock.calls[0]?.[0].content.payload).toBeNull();
  });

  it('warns and no-ops when no emitter is available', () => {
    const record = vi.fn();
    const ctx = {
      record,
      runInBatch: vi.fn(),
      beginBatch: vi.fn(),
      config: {} as never,
      moduleRef: {
        get: () => {
          throw new Error('not found');
        },
      } as never,
    };
    expect(() => new NotificationsWatcher().register(ctx)).not.toThrow();
    expect(record).not.toHaveBeenCalled();
  });
});
