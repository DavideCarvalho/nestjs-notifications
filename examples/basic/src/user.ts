import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';

/** A simple domain object that can receive notifications. */
export class User implements Notifiable {
  constructor(
    public readonly id: number,
    public readonly email: string,
  ) {}

  routeNotificationFor(channel: string): unknown {
    if (channel === 'mail') return this.email;
    // 'database' falls back to toNotifiableRef() below.
    return undefined;
  }

  toNotifiableRef(): NotifiableRef {
    return { type: 'User', id: this.id };
  }
}
