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

- `<Inbox/>` — bell + badge + dropdown panel with relative time, read/unread styling, "mark all read", click-to-read, and "load more" infinite scroll. Props: `renderItem`, `emptyState`, `title`, `markReadOnClick`, `onItemClick`, `className`/`style`/`panelClassName`.
- `<NotificationBell count onClick/>` — the composable bell + badge.

## SSR / `EventSource` safety

The `EventSource` is only created inside `useEffect`, guarded on `typeof window !== 'undefined' && typeof EventSource !== 'undefined'`, and closed on unmount — safe under Next.js/Remix server rendering. The `NotificationsClient` uses the global `fetch`; pass a `fetch` impl for non-browser runtimes.

## Codegen note

The `NotificationsClient` here is hand-written and kept in sync with `createNotificationsController` by hand. A future `nestjs-codegen` generator could emit this client (and types) directly from the controller's decorators, removing the manual mirroring. That generator is not built yet; the hand-written client is the current approach.
