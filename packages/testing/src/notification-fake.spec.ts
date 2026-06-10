import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it } from 'vitest';
import { NotificationFake } from './notification-fake';

class TestUser implements Notifiable {
  constructor(
    public id: number,
    public email: string,
  ) {}
  routeNotificationFor(channel: string): unknown {
    if (channel === 'mail') return this.email;
    return undefined;
  }
}

class InvoicePaid implements Notification {
  constructor(public amount = 100) {}
  via(): string[] {
    return ['mail', 'database'];
  }
}

class Welcome implements Notification {
  via(): string[] {
    return ['mail'];
  }
}

describe('NotificationFake', () => {
  it('records sends and supports Laravel-style assertions', async () => {
    const fake = new NotificationFake();
    const user = new TestUser(1, 'a@b.com');

    // Nothing sent yet.
    expect(() => fake.assertNothingSent()).not.toThrow();

    await fake.send(user, new InvoicePaid(250));

    // assertNothingSent now throws.
    expect(() => fake.assertNothingSent()).toThrow();

    fake.assertCount(1);
    fake.assertSentTimes(InvoicePaid, 1);
    fake.assertSentTimes(Welcome, 0);

    fake.assertSent(InvoicePaid);
    fake.assertSent(InvoicePaid, (r) => (r.notification as InvoicePaid).amount === 250);

    // By reference and by predicate.
    fake.assertSentTo(user, InvoicePaid);
    fake.assertSentTo((n) => (n as TestUser).id === 1, InvoicePaid);

    fake.assertSentOnChannel('mail');
    fake.assertSentOnChannel('database', InvoicePaid);

    expect(fake.sent(InvoicePaid)).toHaveLength(1);
    expect(fake.sent()[0]?.mode).toBe('sync');
  });

  it('throws on failing assertions', async () => {
    const fake = new NotificationFake();
    const user = new TestUser(1, 'a@b.com');

    await fake.send(user, new InvoicePaid());

    expect(() => fake.assertCount(2)).toThrow();
    expect(() => fake.assertSentTimes(InvoicePaid, 5)).toThrow();
    expect(() => fake.assertSent(Welcome)).toThrow();
    expect(() => fake.assertSentTo(new TestUser(2, 'x@y.com'), InvoicePaid)).toThrow();
    expect(() => fake.assertSentOnChannel('slack')).toThrow();
    expect(() => fake.assertSent(InvoicePaid, () => false)).toThrow();
  });

  it('handles arrays, queue mode, route, and reset', async () => {
    const fake = new NotificationFake();
    const users = [new TestUser(1, 'a@b.com'), new TestUser(2, 'c@d.com')];

    await fake.send(users, new Welcome());
    fake.assertCount(2);

    // shouldQueue -> async mode.
    const queued = Object.assign(new Welcome(), { shouldQueue: true });
    await fake.send(new TestUser(3, 'e@f.com'), queued);
    expect(fake.sent()[2]?.mode).toBe('async');

    // sendNow / sendAsync force the mode regardless of shouldQueue.
    await fake.sendNow(new TestUser(4, 'g@h.com'), queued);
    expect(fake.sent()[3]?.mode).toBe('sync');
    await fake.sendAsync(new TestUser(5, 'i@j.com'), new Welcome());
    expect(fake.sent()[4]?.mode).toBe('async');

    // route() records against an anonymous notifiable.
    await fake.route('mail', 'on-demand@b.com').notify(new Welcome());
    fake.assertSentOnChannel('mail', Welcome);

    fake.reset();
    fake.assertNothingSent();
  });

  it('treats a throwing via() as zero channels', async () => {
    const fake = new NotificationFake();
    const boom: Notification = {
      via() {
        throw new Error('boom');
      },
    };
    await fake.send(new TestUser(1, 'a@b.com'), boom);
    fake.assertCount(1);
    expect(fake.sent()[0]?.channels).toEqual([]);
  });
});
