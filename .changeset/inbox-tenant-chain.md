---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-database": minor
---

Inbox tenancy follows the full `@dudousxd/nestjs-context` contract (2.1+): nested tenant chains, families and `required`.

- `tenancy.kinds` now picks a level of a nested tenant (e.g. `['clinic']` scopes a unit's request by its clinic), for inbox reads and for the tenant stamped on new rows.
- New `tenancy.family` scopes the inbox by a secondary tenant family.
- With the context's `tenancy.required` (or the inbox's own `tenancy.required`), an inbox read or mutation with no tenant answers `403` instead of showing tenantless rows. Sends, queues and workers never require a tenant.
- `captureContext()` records the tenant chain and families (`CapturedContext.tenants`) when the context has them, so an async worker stamps the same level. Flat tenants capture exactly what they did before.

An older context ignores the new options and keeps the flat behaviour.
