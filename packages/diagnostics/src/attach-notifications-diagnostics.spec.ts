import { type DiagnosticEvent, getChannel, resetRegistry } from '@dudousxd/nestjs-diagnostics';
import {
  type Notifiable,
  type Notification,
  NotificationEvents,
  NotificationFailedEvent,
  NotificationSentEvent,
} from '@dudousxd/nestjs-notifications-core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, describe, expect, it } from 'vitest';
import { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';

const notifiable = {} as Notifiable;
const notification = {} as Notification;

/** Subscribe to one notifications channel and collect the diagnostic envelopes it receives. */
function capture(event: string) {
  const seen: DiagnosticEvent[] = [];
  const listener = (msg: unknown) => seen.push(msg as DiagnosticEvent);
  const channel = getChannel('notifications', event);
  channel.subscribe(listener);
  return { seen, off: () => channel.unsubscribe(listener) };
}

describe('attachNotificationsDiagnostics', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    resetRegistry();
  });

  it('emits notification.sent on aviary:notifications:sent with the event as payload', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const sent = capture('sent');
    cleanups.push(sent.off);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail', 'tenant-1', 12, { id: 'p1' }),
    );

    expect(sent.seen.length).toBe(1);
    const payload = sent.seen[0]?.payload as NotificationSentEvent;
    expect(payload.channel).toBe('mail');
    expect(payload.durationMs).toBe(12);
  });

  it('emits notification.failed on aviary:notifications:failed carrying the error', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const failed = capture('failed');
    cleanups.push(failed.off);

    emitter.emit(
      NotificationEvents.failed,
      new NotificationFailedEvent(
        notifiable,
        notification,
        'sms',
        new Error('boom'),
        'tenant-1',
        5,
      ),
    );

    expect(failed.seen.length).toBe(1);
    const payload = failed.seen[0]?.payload as NotificationFailedEvent;
    expect((payload.error as Error).message).toBe('boom');
  });

  it('propagates captured.traceId onto the diagnostic envelope', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));
    const sent = capture('sent');
    cleanups.push(sent.off);

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail', 'tenant-1', 1, undefined, {
        traceId: 't-1',
      }),
    );

    expect(sent.seen[0]?.traceId).toBe('t-1');
  });

  it('stops emitting after the returned unsubscribe is called', () => {
    const emitter = new EventEmitter2();
    const off = attachNotificationsDiagnostics(emitter);
    const sent = capture('sent');
    cleanups.push(sent.off);
    off();

    emitter.emit(
      NotificationEvents.sent,
      new NotificationSentEvent(notifiable, notification, 'mail'),
    );

    expect(sent.seen.length).toBe(0);
  });

  it('does not throw when no channel is subscribed', () => {
    const emitter = new EventEmitter2();
    cleanups.push(attachNotificationsDiagnostics(emitter));

    expect(() =>
      emitter.emit(
        NotificationEvents.sent,
        new NotificationSentEvent(notifiable, notification, 'mail'),
      ),
    ).not.toThrow();
  });
});
