---
"@dudousxd/nestjs-notifications-broadcast": minor
"@dudousxd/nestjs-notifications-bullmq": minor
"@dudousxd/nestjs-notifications-client": minor
"@dudousxd/nestjs-notifications-codegen": minor
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-database-drizzle": minor
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
"@dudousxd/nestjs-notifications-database-prisma": minor
"@dudousxd/nestjs-notifications-database-typeorm": minor
"@dudousxd/nestjs-notifications-delivery-tracking": minor
"@dudousxd/nestjs-notifications-diagnostics": minor
"@dudousxd/nestjs-notifications-discord": minor
"@dudousxd/nestjs-notifications-event-emitter": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-push": minor
"@dudousxd/nestjs-notifications-react": minor
"@dudousxd/nestjs-notifications-redis": minor
"@dudousxd/nestjs-notifications-resilience": minor
"@dudousxd/nestjs-notifications-slack": minor
"@dudousxd/nestjs-notifications-sms": minor
"@dudousxd/nestjs-notifications-sse": minor
"@dudousxd/nestjs-notifications-teams": minor
"@dudousxd/nestjs-notifications-telegram": minor
"@dudousxd/nestjs-notifications-telescope": minor
"@dudousxd/nestjs-notifications-testing": minor
"@dudousxd/nestjs-notifications-webhook": minor
---

**Breaking:** require Node.js 24 or newer. Every package now declares `engines.node` `>=24` (none declared it before). CI tests on Node 24 and 26.

Also removed (see Reference → Upgrading in the docs):

- `@dudousxd/nestjs-notifications-core`: the `TenantScopedNotifier` type, a deprecated alias of `ScopedNotifier`. Rename it.
