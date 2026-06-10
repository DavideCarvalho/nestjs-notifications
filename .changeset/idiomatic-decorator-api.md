---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-broadcast": minor
"@dudousxd/nestjs-notifications-slack": minor
"@dudousxd/nestjs-notifications-testing": minor
---

Add an idiomatic, decorator-driven notification API (additive — the interface/`via()` style still works):

- **Channel decorators**: annotate payload methods with channel handles (`@Mail()`, `@Database()`, `@Broadcast()`, `@Slack()`); `via()` is inferred, so no magic-string channel list and no `implements`.
- **Type-safe channel tokens**: the same handles double as values in `via()` — `via() { return [Mail, Database]; }` — no magic strings.
- **Dependency injection**: `@InjectService(Token)` injects providers into a notification at delivery time (and after async rehydration), so notifications stay `new`-able with data while using services.
- **`@Notification({ name })`** marks a notification and pins a stable name for async (de)serialization.

`NotificationService` and `NotificationFake` now accept any notification instance (`NotificationInput`).
