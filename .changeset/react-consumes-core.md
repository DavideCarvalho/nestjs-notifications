---
'@dudousxd/nestjs-notifications-react': minor
---

The React package now builds on the new framework-neutral `@dudousxd/nestjs-notifications-client` core: the `NotificationsClient`, types, and the new `createNotificationsClient` are re-exported from it (back-compatible), and the hooks/widget consume the shared client. For headless usage or TanStack Query, use the core (and its `/tanstack` subpath) directly.
