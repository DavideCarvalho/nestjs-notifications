---
'@dudousxd/nestjs-notifications-client': minor
'@dudousxd/nestjs-notifications-react': minor
---

`subscribeNotificationsStream` / `useNotificationsStream` now accept an optional `credentials` (`RequestCredentials`), forwarded to `fetch`. Defaults to `'include'` (unchanged behavior); pass `'same-origin'`/`'omit'` to opt out of sending cookies.
