---
"@dudousxd/nestjs-notifications-database-mikro-orm": minor
---

Target MikroORM v7. The peer range is now `^7.0.0` for `@mikro-orm/core` and
`@mikro-orm/nestjs` (v6 is no longer supported), and `@mikro-orm/decorators` is
a new peer dependency (v7 moved the decorators out of `@mikro-orm/core`). The
entity now imports its decorators from `@mikro-orm/decorators/legacy` and
declares an explicit column `type` on every property so discovery works without
`emitDecoratorMetadata`. Internally `persistAndFlush` was replaced with
`persist().flush()` to match the v7 EntityManager.
