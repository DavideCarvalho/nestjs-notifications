---
"@dudousxd/nestjs-notifications-database": minor
---

The auto-mounted inbox controller now accepts `guards` via the `controller`
option (`DatabaseChannelModule.forRoot({ controller: { guards: [AuthGuard], path, resolveRef } })`).
This lets apps that need an auth guard on the inbox keep using the auto-mounted
controller instead of wiring `createNotificationsController` by hand.
