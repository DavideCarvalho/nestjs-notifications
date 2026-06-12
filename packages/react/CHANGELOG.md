# @dudousxd/nestjs-notifications-react

## 0.4.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

### Patch Changes

- Updated dependencies [a177275]
  - @dudousxd/nestjs-notifications-client@0.3.0

## 0.3.0

### Minor Changes

- 39b9152: The React package now builds on the new framework-neutral `@dudousxd/nestjs-notifications-client` core: the `NotificationsClient`, types, and the new `createNotificationsClient` are re-exported from it (back-compatible), and the hooks/widget consume the shared client. For headless usage or TanStack Query, use the core (and its `/tanstack` subpath) directly.

### Patch Changes

- Updated dependencies [39b9152]
  - @dudousxd/nestjs-notifications-client@0.2.0

## 0.2.0

### Minor Changes

- 67db54f: New @dudousxd/nestjs-notifications-react package: drop-in <Inbox/> widget plus useNotifications / useUnreadCount hooks and a NotificationsProvider, consuming the read API and SSE stream.
