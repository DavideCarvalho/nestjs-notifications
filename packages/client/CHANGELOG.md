# @dudousxd/nestjs-notifications-client

## 0.3.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

## 0.2.0

### Minor Changes

- 39b9152: New @dudousxd/nestjs-notifications-client package: framework-neutral headless SDK for the notifications read API + SSE stream (createNotificationsClient, client.subscribe), plus TanStack Query option factories at the /tanstack subpath (notificationKeys, notificationQueries, notificationMutations).
