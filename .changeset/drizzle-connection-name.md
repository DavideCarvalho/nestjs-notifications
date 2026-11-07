---
"@dudousxd/nestjs-notifications-database-drizzle": minor
---

`DrizzleNotificationStoreModule.forRoot({ connectionName })` and `DrizzlePendingDigestStoreModule.forRoot({ connectionName })` use a database registered with `@nestjs/drizzle`'s `DrizzleModule` (token `getDrizzleToken(connectionName)`; optional peer). `db` keeps working; `forRootAsync`'s factory returns `{ db, tables? }`.
