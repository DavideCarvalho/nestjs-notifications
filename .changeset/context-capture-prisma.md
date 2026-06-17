---
"@dudousxd/nestjs-notifications-database-prisma": minor
---

Persist the captured trigger context. The store now reads/writes `causerType`/`causerId`/`traceId`, writing them only when supplied so consumers who have not added the columns are unaffected. Prisma is schema-first/consumer-managed: to persist these, add three nullable `String?` columns (`causerType`, `causerId`, `traceId`) to your `Notification` model in `schema.prisma` and run `prisma migrate` — the library does not run DDL.
