# @dudousxd/nestjs-notifications-react

Drop-in React inbox widget and hooks for [nestjs-notifications](https://github.com/DavideCarvalho/nestjs-notifications). Consumes the library's existing HTTP read API (`createNotificationsController`) and SSE stream — Novu/Knock-style DX, dependency-free styling, SSR-safe.

## Install

```bash
pnpm add @dudousxd/nestjs-notifications-react
# peers
pnpm add react react-dom
```

## Quick start

Wrap your app once, then drop in `<Inbox/>`:

```tsx
import { NotificationsProvider, Inbox } from '@dudousxd/nestjs-notifications-react';

function App() {
  return (
    <NotificationsProvider
      clientOptions={{ baseUrl: '/api', credentials: 'include' }}
      sseUrl="/api/notifications/stream"
    >
      <Header>
        <Inbox />
      </Header>
    </NotificationsProvider>
  );
}
```

The provider is optional — every hook and `<Inbox/>` also accept `client` / `clientOptions` / `sseUrl` directly.

## What it consumes

The host app mounts the read API via `createNotificationsController` from `@dudousxd/nestjs-notifications-database`:

| Method                                | Endpoint                                |
| ------------------------------------- | --------------------------------------- |
| `list({ page, perPage })`             | `GET {baseUrl}notifications`            |
| `unread()`                            | `GET {baseUrl}notifications/unread`     |
| `unreadCount()`                       | `GET {baseUrl}notifications/unread/count` |
| `markAsRead(id)`                      | `POST {baseUrl}notifications/:id/read`  |
| `markAllAsRead()`                     | `POST {baseUrl}notifications/read-all`  |
| `remove(id)`                          | `DELETE {baseUrl}notifications/:id`     |

Live updates come from the `@dudousxd/nestjs-notifications-sse` channel — point `sseUrl` at the `@Sse()` endpoint your host exposes.

## API

### `NotificationsClient`

```ts
const client = new NotificationsClient({
  baseUrl: '/api',                              // default '/'
  headers: () => ({ Authorization: `Bearer ${token}` }), // static object or () => {...}
  credentials: 'include',                       // forwarded to fetch
});
```

### Hooks

- `useNotifications(options?)` → `{ notifications, loading, error, hasMore, loadMore, markAsRead, markAllAsRead, remove, refresh }`. Fetches page 1 on mount, dedupes by id, optimistic `markAsRead`/`markAllAsRead`/`remove` with rollback.
- `useUnreadCount(options?)` → `{ count, refresh }`. Subscribes to the SSE stream when `sseUrl` is set and `EventSource` exists; otherwise polls `pollIntervalMs` (default 30s).

### Components

- `<Inbox/>` — bell + badge + dropdown panel with relative time, read/unread styling, "mark all read", click-to-read, and "load more" infinite scroll. The default row also renders a **progress bar** for long-running notifications (a `data.progress` of `0`–`100`) and a **download/action link** (a `data.action` of `{ label, url }`, or a flat `actionUrl`/`downloadUrl`). Props: `renderItem`, `emptyState`, `title`, `markReadOnClick`, `onItemClick`, `className`/`style`/`panelClassName`.
- `<NotificationBell count onClick/>` — the composable bell + badge.

### Helpers (also useful inside a custom `renderItem`)

- `notificationTitle(item)` / `notificationBody(item)` — pull a title/body from conventional `data` keys (`title`/`subject`/`name`, `body`/`message`/`description`, …).
- `notificationProgress(item)` — a clamped `0`–`100` from `data.progress` (numeric strings accepted), or `null` when there's nothing to show.
- `notificationAction(item)` — `{ label, url }` from `data.action` or flat `actionUrl`/`downloadUrl` (+ `actionLabel`), or `null`.
- `isUnread(item)`, `formatRelativeTime(value)`, `mergeNotifications(a, b)`.

## SSR / `EventSource` safety

The `EventSource` is only created inside `useEffect`, guarded on `typeof window !== 'undefined' && typeof EventSource !== 'undefined'`, and closed on unmount — safe under Next.js/Remix server rendering. The `NotificationsClient` uses the global `fetch`; pass a `fetch` impl for non-browser runtimes.

## Codegen alternative

The `NotificationsClient` here is hand-written and zero-config. If you'd rather generate a typed client
from your controllers (so it can't drift from your routes), use [`@dudousxd/nestjs-codegen`](https://www.npmjs.com/package/@dudousxd/nestjs-codegen) — it emits a typed `api.ts` from a static decorated inbox controller. The runnable [`examples/basic`](https://github.com/DavideCarvalho/nestjs-notifications/tree/main/examples/basic) app wires it end to end, and the docs cover it under **Recipes → Typed client with codegen**.
