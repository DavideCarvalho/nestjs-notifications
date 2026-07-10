import { describe, expect, it } from 'vitest';
import { notificationName } from './base-channel';
import { Notification } from './interfaces';
import type { Notification as NotificationInterface } from './interfaces';

describe('notificationName', () => {
  it('falls back to the class name when neither the decorator nor notificationType() are present', () => {
    class PlainNotification implements NotificationInterface {}
    expect(notificationName(new PlainNotification())).toBe('PlainNotification');
  });

  it('uses the class-level @Notification({ name }) over the class name', () => {
    @Notification({ name: 'invoice.paid' })
    class InvoicePaid implements NotificationInterface {}
    expect(notificationName(new InvoicePaid())).toBe('invoice.paid');
  });

  it('prefers the instance notificationType() over the class-level @Notification({ name })', () => {
    @Notification({ name: 'generic.event' })
    class GenericEvent implements NotificationInterface {
      constructor(private readonly eventName: string) {}
      notificationType(): string {
        return this.eventName;
      }
    }
    expect(notificationName(new GenericEvent('user.signed_up'))).toBe('user.signed_up');
  });

  it('prefers the instance notificationType() over the plain class name', () => {
    class GenericEvent implements NotificationInterface {
      notificationType(): string {
        return 'order.shipped';
      }
    }
    expect(notificationName(new GenericEvent())).toBe('order.shipped');
  });
});
