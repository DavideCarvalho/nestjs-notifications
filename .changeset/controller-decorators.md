---
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-sse": minor
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

Mounted controllers work with NestJS's first-party `@nestjs/authorization`.

- New `decorators?: ClassDecorator[]` option, applied in order to every controller the library mounts: `DatabaseChannelModule.forRoot()`/`forFeature()`, `createNotificationsController()`, `createNotificationsStreamController()`, `createPreferenceCenterController()`, `createTwilioStatusController()` and `createSesNotificationController()`. Pass e.g. `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]`.
- Every one of these controllers is marked open to `@nestjs/authorization`'s deny-by-default global guard (`authorization:can-anyone`, what `Can.Anyone()` writes), so an app that registers `AuthorizationModule.forRoot()` no longer gets them refused. Existing `guards`, `resolveRef` and signature checks keep deciding who reaches them; a `@Can()` passed in `decorators` is still enforced. No dependency on `@nestjs/authorization` is added.
