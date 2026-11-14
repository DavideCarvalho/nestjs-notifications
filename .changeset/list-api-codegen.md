---
'@dudousxd/nestjs-notifications-codegen': minor
---

The injected inbox routes follow the Aviary list API: `list` takes `page`, `size`, `sort` and `'filter[type]'` and returns `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }`; `unread` returns `{ data }`; `unread` and `unreadCount` take `'filter[type]'`. The default `infiniteQueryOptions` selector of `@dudousxd/nestjs-codegen-tanstack` reads `meta.page`, so pass `getNextPageParam: nextNotificationsPage` from `@dudousxd/nestjs-notifications-client/tanstack`.
