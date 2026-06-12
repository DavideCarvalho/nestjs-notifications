---
'@dudousxd/nestjs-notifications-client': minor
'@dudousxd/nestjs-notifications-react': minor
---

Add an SSE stream subscription to the SDK — the one piece codegen can't generate (it does request/response, not streaming).

- `subscribeNotificationsStream({ url, onUpdate, headers?, fetch?, ... })` (client): framework-agnostic core. Uses `fetch` (not `EventSource`) so requests carry auth headers, parses SSE frames, ignores heartbeats, and reconnects with exponential backoff. Returns an unsubscribe function.
- `useNotificationsStream({ url, onUpdate, headers?, ... })` (react): thin React wrapper. Query-library agnostic — you decide what `onUpdate` does (e.g. invalidate TanStack queries), so the package gains no query-library dependency. Callbacks are read through refs, so fresh closures don't reconnect.

The `headers: () => Record<string, string>` shape mirrors a fetch-client's dynamic-headers option, so you can pass the same auth function you give your HTTP client and configure credentials once.
