import { describe, expect, it } from 'vitest';
import type { Notification as NotificationInterface } from './interfaces';
import { NotificationSerializer } from './serializer';

/**
 * A generic notification class carrying the real event name as instance data via
 * notificationType(), the shape Feature 1 (instance-level notification type) targets.
 */
class GenericEvent implements NotificationInterface {
  constructor(private readonly eventName: string) {}

  notificationType(): string {
    return this.eventName;
  }

  via(): string[] {
    return ['mail'];
  }
}

function serializer(): NotificationSerializer {
  return new NotificationSerializer({ notifications: [GenericEvent] });
}

describe('NotificationSerializer with an instance-level notificationType()', () => {
  it('still serializes under the CLASS name, not the instance notificationType()', () => {
    const serialized = serializer().serializeNotification(new GenericEvent('user.signed_up'));
    expect(serialized.name).toBe('GenericEvent');
  });

  it('rehydrates via the class name, and the rehydrated instance still reports its instance-level type', () => {
    const original = new GenericEvent('user.signed_up');
    const engine = serializer();

    const serialized = engine.serializeNotification(original);
    // Rehydration must succeed: the registry is keyed by the class name, so a generic class is
    // still found even though notificationType() varies per instance.
    const rehydrated = engine.deserializeNotification(serialized) as GenericEvent;

    expect(rehydrated).toBeInstanceOf(GenericEvent);
    // The instance data (constructor-set eventName) round-trips through serialize()'s structural
    // copy, so notificationType() on the rehydrated instance still returns the original value.
    expect(rehydrated.notificationType()).toBe('user.signed_up');
  });
});
