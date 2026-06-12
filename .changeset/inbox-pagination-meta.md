---
'@dudousxd/nestjs-notifications-database': minor
'@dudousxd/nestjs-notifications-client': minor
'@dudousxd/nestjs-notifications-react': minor
'@dudousxd/nestjs-notifications-codegen': minor
---

Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.
