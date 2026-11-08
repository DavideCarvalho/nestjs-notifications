---
"@dudousxd/nestjs-notifications-broadcast": patch
"@dudousxd/nestjs-notifications-bullmq": patch
"@dudousxd/nestjs-notifications-client": patch
"@dudousxd/nestjs-notifications-codegen": patch
"@dudousxd/nestjs-notifications-core": patch
"@dudousxd/nestjs-notifications-database-drizzle": patch
"@dudousxd/nestjs-notifications-database-mikro-orm": patch
"@dudousxd/nestjs-notifications-database-prisma": patch
"@dudousxd/nestjs-notifications-database-typeorm": patch
"@dudousxd/nestjs-notifications-database": patch
"@dudousxd/nestjs-notifications-delivery-tracking": patch
"@dudousxd/nestjs-notifications-diagnostics": patch
"@dudousxd/nestjs-notifications-discord": patch
"@dudousxd/nestjs-notifications-event-emitter": patch
"@dudousxd/nestjs-notifications-mail": patch
"@dudousxd/nestjs-notifications-preferences": patch
"@dudousxd/nestjs-notifications-push": patch
"@dudousxd/nestjs-notifications-react": patch
"@dudousxd/nestjs-notifications-redis": patch
"@dudousxd/nestjs-notifications-resilience": patch
"@dudousxd/nestjs-notifications-slack": patch
"@dudousxd/nestjs-notifications-sms": patch
"@dudousxd/nestjs-notifications-sse": patch
"@dudousxd/nestjs-notifications-teams": patch
"@dudousxd/nestjs-notifications-telegram": patch
"@dudousxd/nestjs-notifications-telescope": patch
"@dudousxd/nestjs-notifications-testing": patch
"@dudousxd/nestjs-notifications-webhook": patch
---

Fix packages that could be published without files their `exports` point to. The two tsup passes (ESM, CJS) no longer each clean `dist/` while running at the same time; `dist/` is cleaned once before the build. A new `check:exports` step (also `prepack`) fails the release if any `exports`/`main`/`types` path is missing.
