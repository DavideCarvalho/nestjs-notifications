import { Notifiable, NotifiableId, RouteFor } from '@dudousxd/nestjs-notifications-core';

/**
 * A domain object that can receive notifications. The per-channel addresses are declared with
 * `@RouteFor`, and `@Notifiable()` + `@NotifiableId()` provide the async reference — no
 * `routeNotificationFor` switch and no manual `toNotifiableRef`.
 */
@Notifiable()
export class User {
  @NotifiableId()
  id: number;

  @RouteFor('mail')
  email: string;

  constructor(id: number, email: string) {
    this.id = id;
    this.email = email;
  }
}
