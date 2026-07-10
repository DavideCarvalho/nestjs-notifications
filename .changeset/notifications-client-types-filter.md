---
"@dudousxd/nestjs-notifications-client": minor
---

`client.list()`/`unread()`/`unreadCount()` accept a `types?: string[]` filter, sent as the comma-separated `?type=` query param the backend splits/trims (empty/absent = no filter, omits the param). `notificationKeys.unread()`/`unreadCount()` now take an optional `NotificationsFilterParams` and always append it (even `{}`) to the query key, matching the existing `list()` key shape — a minor change to the emitted cache-key shape for consumers pinning exact key arrays.
