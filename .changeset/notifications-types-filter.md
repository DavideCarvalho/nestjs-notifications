---
"@dudousxd/nestjs-notifications-database": minor
---

Add a `types` filter to the inbox read path. `NotificationStore.getForNotifiable`/`getUnread` gain a trailing optional `types?: string[]` parameter, and `PaginateForNotifiableOptions` gains `types?: string[]` — when present and non-empty, only rows whose `type` is in the list are returned; absent or an empty array matches every type (unchanged behavior). `NotificationsQueryService`/`ScopedNotificationsQuery`'s `all()`/`unread()`/`unreadCount()` gain an optional `{ types? }` options argument, and `PaginateOptions` gains `types?: string[]`. `createNotificationsController`'s `GET /`, `GET /unread`, and `GET /unread/count` routes now accept `?type=A,B` (comma-separated, trimmed, blanks dropped) and thread it through. The in-memory store implements the filter; the shared `NotificationStore` contract in `test-contracts/notification-store.contract.ts` gained coverage exercised by every adapter's `*.contract.spec.ts`.
