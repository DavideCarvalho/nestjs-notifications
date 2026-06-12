# @dudousxd/nestjs-notifications-codegen

## 0.4.0

### Minor Changes

- f98b115: Make the inbox base path configurable, so the API can avoid colliding with a `/notifications` page route under a shared global prefix.

  - database: `DatabaseChannelModule.forRoot({ controller: { path } })` (and `createNotificationsController({ path })`, already supported) mount the inbox at a custom base.
  - codegen: `nestjsNotificationsCodegen({ path })` emits the inbox routes at that path (independent of `name`, the client namespace).

  Keep the controller `path`, the codegen `path`, and the client `path` in sync.

## 0.3.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

## 0.2.0

### Minor Changes

- 276c1dc: New @dudousxd/nestjs-notifications-codegen package: a nestjs-codegen extension that emits the notifications HTTP API (inbox + optional preference center) into the generated client, so the endpoints are available as a typed client / TanStack hooks / Inertia helpers — even when mounting the createNotificationsController factory that static discovery can't see.
