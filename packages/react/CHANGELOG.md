# @dudousxd/nestjs-notifications-react

## 0.3.0

### Minor Changes

- 39b9152: The React package now builds on the new framework-neutral `@dudousxd/nestjs-notifications-client` core: the `NotificationsClient`, types, and the new `createNotificationsClient` are re-exported from it (back-compatible), and the hooks/widget consume the shared client. For headless usage or TanStack Query, use the core (and its `/tanstack` subpath) directly.

### Patch Changes

- Updated dependencies [39b9152]
  - @dudousxd/nestjs-notifications-client@0.2.0

## 0.2.0

### Minor Changes

- 67db54f: New @dudousxd/nestjs-notifications-react package: drop-in <Inbox/> widget plus useNotifications / useUnreadCount hooks and a NotificationsProvider, consuming the read API and SSE stream.
