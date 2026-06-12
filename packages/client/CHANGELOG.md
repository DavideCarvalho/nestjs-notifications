# @dudousxd/nestjs-notifications-client

## 0.5.0

### Minor Changes

- 461bcaf: `subscribeNotificationsStream` / `useNotificationsStream` now accept an optional `credentials` (`RequestCredentials`), forwarded to `fetch`. Defaults to `'include'` (unchanged behavior); pass `'same-origin'`/`'omit'` to opt out of sending cookies.

## 0.4.0

### Minor Changes

- 93bc116: Add an SSE stream subscription to the SDK — the one piece codegen can't generate (it does request/response, not streaming).

  - `subscribeNotificationsStream({ url, onUpdate, headers?, fetch?, ... })` (client): framework-agnostic core. Uses `fetch` (not `EventSource`) so requests carry auth headers, parses SSE frames, ignores heartbeats, and reconnects with exponential backoff. Returns an unsubscribe function.
  - `useNotificationsStream({ url, onUpdate, headers?, ... })` (react): thin React wrapper. Query-library agnostic — you decide what `onUpdate` does (e.g. invalidate TanStack queries), so the package gains no query-library dependency. Callbacks are read through refs, so fresh closures don't reconnect.

  The `headers: () => Record<string, string>` shape mirrors a fetch-client's dynamic-headers option, so you can pass the same auth function you give your HTTP client and configure credentials once.

## 0.3.0

### Minor Changes

- a177275: Inbox pagination now uses a conventional `meta` envelope — `{ items, meta: { page, perPage, total, lastPage } }` — instead of flat `{ items, page, perPage, total }`. This matches the pagination shape nestjs-codegen's generated `infiniteQueryOptions()` expects, so a frontend gets working infinite scroll over the inbox with zero hand-written glue (and `lastPage` makes "has more" explicit). Breaking for readers of `PaginatedNotifications` — read `result.meta.*`.

## 0.2.0

### Minor Changes

- 39b9152: New @dudousxd/nestjs-notifications-client package: framework-neutral headless SDK for the notifications read API + SSE stream (createNotificationsClient, client.subscribe), plus TanStack Query option factories at the /tanstack subpath (notificationKeys, notificationQueries, notificationMutations).
