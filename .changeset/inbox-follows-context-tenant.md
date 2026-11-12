---
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-core": minor
---

The database channel and inbox can follow the request's tenant from `@dudousxd/nestjs-context`. A new `tenancy` option on `DatabaseChannelModule.forRoot()`/`forFeature()` (`'inherit' | false | { enabled, kinds, nullRows }`, default `'inherit'`) follows the context's tenancy switch, which is off by default. With it on, `NotificationsQueryService` and the inbox controller show a request only its own tenant's rows (rows with no tenant only to requests with no tenant, unless `nullRows: 'shared'`), a row of another tenant answers 404, and sends with no explicit tenant are stored with the request's tenant. An explicit `forTenant(id)` still wins. Core's context accessor mirror gains the optional `tenant()`, `tenancy()` and `tenantFilter()` methods, and the captured context records the tenant's kind.
