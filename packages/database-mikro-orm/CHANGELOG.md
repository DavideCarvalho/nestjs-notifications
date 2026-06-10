# @dudousxd/nestjs-notifications-database-mikro-orm

## 0.2.1

### Patch Changes

- 4b3bd0a: Database channel: add an in-app read API and harden the ORM adapters.

  - New `NotificationsQueryService` (in `@dudousxd/nestjs-notifications-database`) for showing
    stored notifications in-app: `all`, `unread`, `unreadCount`, `paginate`, `markAsRead`,
    `markAllAsRead`, `delete` — accepts a `Notifiable` or a `{ type, id }` ref. Plus an optional
    `createNotificationsController({ resolveRef })` factory that mounts the matching REST routes.
  - TypeORM adapter: portable column types (works on SQLite/MySQL/Postgres) and code-set
    millisecond timestamps for stable ordering — fixes `timestamp`/`json`/`uuid` types that broke
    on SQLite.
  - MikroORM adapter: explicit `datetime` columns so `readAt`/`createdAt`/`updatedAt` round-trip as
    `Date` on every driver.

  Both ORM adapters now have real-database (SQLite) integration tests.
