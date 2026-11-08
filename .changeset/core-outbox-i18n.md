---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-testing": minor
---

**Breaking.** Transactional sends over `@nestjs/outbox`, translation through `@nestjs/i18n`; `InMemoryTranslator` is removed.

- `notifications.inTransaction(tx).send(...)`: the job carries `tx` in memory only (never serialized) and goes through a transactional dispatcher (`DispatchDriver.transactional`); any other dispatcher makes the send throw. `NotificationFake.inTransaction()` mirrors it.
- New subpath `@dudousxd/nestjs-notifications-core/outbox` (optional peer `@nestjs/outbox` ~0.1.4): `outboxDispatcher({ transaction?, key? })` writes each job with `outbox.add(tx, { topic: 'aviary.notifications' })`; `OutboxNotificationHandler` (`@OnOutboxMessage`, consumer `aviary.notifications`) rehydrates it and runs the channels with the outbox message id as `DeliveryContext.idempotencyKey`.
- New subpath `@dudousxd/nestjs-notifications-core/i18n` (optional peer `@nestjs/i18n` ~0.0.3): `I18nServiceTranslator` / `i18nTranslator()`. Channel deliveries run inside `I18nContext.run(locale)` through the new optional `Translator.runInLocale()`.
- Removed `InMemoryTranslator`, `TranslationCatalog` and `localization.catalog`: catalogs are `@nestjs/i18n`'s. Without a translator, keys translate to themselves (`keyTranslator`). `TranslateParams` is `Record<string, unknown>`.
- Serialized jobs now keep `deferredChannels`, so a quiet-hours re-queue delivered by a worker no longer defers again.
- Nest peer floor raised to `^11.0.0 || ^12.0.0`.

Migration: `localization: { catalog }` → `I18nModule.forRoot({ loader: new InMemoryI18nLoader(catalog) })` + `NotificationsModule.forRoot({ providers: [...i18nTranslator()] })`. Custom `ScopedNotifier` implementations add `inTransaction()`. See the "Migrating to NestJS first-party packages" docs page.
