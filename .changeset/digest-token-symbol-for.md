---
"@dudousxd/nestjs-notifications-preferences": patch
"@dudousxd/nestjs-notifications-database-mikro-orm": patch
"@dudousxd/nestjs-notifications-database-typeorm": patch
"@dudousxd/nestjs-notifications-database-prisma": patch
---

`PENDING_DIGEST_STORE` is now a `Symbol.for` global-registry token, and the database adapters
inline it instead of value-importing it from `@dudousxd/nestjs-notifications-preferences`.
Preferences is declared an optional peer of the adapters, but the value import made
`require`-ing any adapter crash at boot (`Cannot find module`) for consumers that don't install
preferences — the digest store module rode along the package index. DI identity is unchanged
(same registry key on both sides, pinned by a drift test); consumers importing the token from
preferences are unaffected.
