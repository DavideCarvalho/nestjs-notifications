---
'@dudousxd/nestjs-notifications-client': minor
---

Follows the Aviary list API of the inbox endpoints. `list({ page, size, types })` sends `page`/`size`/`filter[type]` and resolves `{ data, meta: { total, perPage, currentPage, lastPage, firstPage } }` (was `{ items, meta: { page, perPage, total, lastPage } }`; `perPage` is now `size`). `unread()` and `unreadCount()` send `filter[type]`; `unread()` still resolves an array, unwrapped from the server's `{ data }`. The `tanstack` entry adds `notificationQueries.infiniteList()` and `nextNotificationsPage`, a `getNextPageParam` for the new `meta`.
