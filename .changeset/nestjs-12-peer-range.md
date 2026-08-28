---
'@dudousxd/nestjs-notifications-broadcast': patch
'@dudousxd/nestjs-notifications-bullmq': patch
'@dudousxd/nestjs-notifications-core': patch
'@dudousxd/nestjs-notifications-database': patch
'@dudousxd/nestjs-notifications-database-mikro-orm': patch
'@dudousxd/nestjs-notifications-database-prisma': patch
'@dudousxd/nestjs-notifications-database-typeorm': patch
'@dudousxd/nestjs-notifications-delivery-tracking': patch
'@dudousxd/nestjs-notifications-diagnostics': patch
'@dudousxd/nestjs-notifications-discord': patch
'@dudousxd/nestjs-notifications-event-emitter': patch
'@dudousxd/nestjs-notifications-mail': patch
'@dudousxd/nestjs-notifications-preferences': patch
'@dudousxd/nestjs-notifications-push': patch
'@dudousxd/nestjs-notifications-redis': patch
'@dudousxd/nestjs-notifications-resilience': patch
'@dudousxd/nestjs-notifications-slack': patch
'@dudousxd/nestjs-notifications-sms': patch
'@dudousxd/nestjs-notifications-sse': patch
'@dudousxd/nestjs-notifications-teams': patch
'@dudousxd/nestjs-notifications-telegram': patch
'@dudousxd/nestjs-notifications-telescope': patch
'@dudousxd/nestjs-notifications-testing': patch
'@dudousxd/nestjs-notifications-webhook': patch
---

Add NestJS 12 to the supported peer range.

Every `@nestjs/*` peer that read `^10.0.0 || ^11.0.0` now also admits `^12.0.0`, and the
`@nestjs/event-emitter` peer — which NestJS 12 renumbered from the 3.x line onto the framework's
own 12.x line — reads `^2.0.0 || ^3.0.0 || ^12.0.0`. Installing on NestJS 12 no longer trips a peer
warning; hosts on 10 or 11 are unaffected.

The satellite peers move with it: `@nestjs/websockets` and `@nestjs/platform-socket.io`
(broadcast), `@nestjs/bullmq` (bullmq) and `@nestjs/typeorm` (database-typeorm) all have a 12.x
release, so none of them holds a package back.

One source change was needed, in `sse`. NestJS 12 widened `MessageEvent['data']` to include
`undefined`, so under `exactOptionalPropertyTypes` the hub's cast no longer satisfied the
`Subject<MessageEvent>` it feeds; the cast is now `NonNullable<MessageEvent['data']>`. Runtime
behaviour is unchanged — the backplane never publishes an undefined payload.

Nothing else in the source needed touching. NestJS 12 ships its core packages as pure ESM and these
libraries are already `"type": "module"`, and none of them implements a `PipeTransform` or
subclasses `ConsoleLogger` — the two v12 signature changes that would otherwise have reached
library code. The test suite runs against `@nestjs/common` 12.0.1.
