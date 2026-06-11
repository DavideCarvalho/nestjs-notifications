# @dudousxd/nestjs-notifications-client

Framework-neutral, headless SDK for the [`nestjs-notifications`](https://github.com/DavideCarvalho/nestjs-notifications)
in-app inbox API + SSE stream. Use it when your frontend is separate from the backend (or points at a
different one), or when you just want fetch functions + TanStack Query options without running codegen.

> On NestJS? Prefer generating a typed client with [`@dudousxd/nestjs-codegen`](https://www.npmjs.com/package/@dudousxd/nestjs-codegen)
> — see the docs recipe "Typed client with codegen". This package is the hand-written, framework-neutral
> alternative.

```bash
pnpm add @dudousxd/nestjs-notifications-client
```

## Headless client

```ts
import { createNotificationsClient } from '@dudousxd/nestjs-notifications-client';

const client = createNotificationsClient({
  baseUrl: 'https://api.example.com/',     // the read API is mounted at /notifications
  sseUrl: 'https://api.example.com/notifications/stream',
  headers: { Authorization: `Bearer ${token}` }, // or credentials: 'include'
});

await client.list({ page: 1 });
await client.unreadCount();
await client.markAsRead(id);

// Live updates over SSE (browser). Returns an unsubscribe fn; SSR-safe no-op when no EventSource.
const stop = client.subscribe(({ count }) => {
  // `count` is set when the server pushes it; otherwise re-fetch.
});
```

## TanStack Query

Framework-neutral option factories — work with `@tanstack/react-query` **and** `@tanstack/vue-query`.

```ts
import { createNotificationsClient } from '@dudousxd/nestjs-notifications-client';
import { notificationKeys, notificationQueries, notificationMutations }
  from '@dudousxd/nestjs-notifications-client/tanstack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const client = createNotificationsClient({ baseUrl: '/' });

// query
const { data } = useQuery(notificationQueries.unreadCount(client));

// mutation + cache invalidation via the shared keys
const qc = useQueryClient();
const markRead = useMutation({
  ...notificationMutations.markAsRead(client),
  onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
});
```

The same factories drop into Vue's `useQuery`/`useMutation` from `@tanstack/vue-query`.
