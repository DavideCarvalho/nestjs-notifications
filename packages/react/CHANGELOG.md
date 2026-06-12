# @dudousxd/nestjs-notifications-react

## 0.6.0

### Minor Changes

- 461bcaf: `subscribeNotificationsStream` / `useNotificationsStream` now accept an optional `credentials` (`RequestCredentials`), forwarded to `fetch`. Defaults to `'include'` (unchanged behavior); pass `'same-origin'`/`'omit'` to opt out of sending cookies.

### Patch Changes

- Updated dependencies [461bcaf]
  - @dudousxd/nestjs-notifications-client@0.5.0

## 0.5.0

### Minor Changes

- 93bc116: Add an SSE stream subscription to the SDK — the one piece codegen can't generate (it does request/response, not streaming).

  - `subscribeNotificationsStream({ url, onUpdate, headers?, fetch?, ... })` (client): framework-agnostic core. Uses `fetch` (not `EventSource`) so requests carry auth headers, parses SSE frames, ignores heartbeats, and reconnects with exponential backoff. Returns an unsubscribe function.
  - `useNotificationsStream({ url, onUpdate, headers?, ... })` (react): thin React wrapper. Query-library agnostic — you decide what `onUpdate` does (e.g. invalidate TanStack queries), so the package gains no query-library dependency. Callbacks are read through refs, so fresh closures don't reconnect.

  The `headers: () => Record<string, string>` shape mirrors a fetch-client's dynamic-headers option, so you can pass the same auth function you give your HTTP client and configure credentials once.

### Patch Changes

- Updated dependencies [93bc116]
  - @dudousxd/nestjs-notifications-client@0.4.0

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
