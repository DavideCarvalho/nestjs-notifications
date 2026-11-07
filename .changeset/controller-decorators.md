---
"@dudousxd/nestjs-notifications-database": minor
"@dudousxd/nestjs-notifications-sse": minor
"@dudousxd/nestjs-notifications-preferences": minor
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

**Breaking.** Who reaches a mounted route is now decided only with NestJS's first-party `@nestjs/authentication` / `@nestjs/authorization`: pass `decorators`, or mount the controller yourself.

- New `decorators?: ClassDecorator[]` option, applied in order to every controller the library mounts: `DatabaseChannelModule.forRoot()`/`forFeature()`, `createNotificationsController()`, `createNotificationsStreamController()`, `createPreferenceCenterController()`, `createTwilioStatusController()` and `createSesNotificationController()`. E.g. `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]`.
- `guards` is removed from `DatabaseChannelModule`'s `controller` options and from `createNotificationsController()`, `createNotificationsStreamController()` and `createPreferenceCenterController()`.
- `DatabaseChannelModule.forRoot()`/`forFeature()` take `routes?: boolean` (default `true`) to turn the inbox auto-mount off; `controller` now only takes `{ resolveRef, path }` (no more `controller: false`).
- The auto-mounted inbox's default resolver answers `401` when there is no `req.user.id`, instead of resolving every anonymous caller to one shared `"undefined"` inbox.
- Every controller is marked open to `@nestjs/authorization`'s deny-by-default global guard (`authorization:can-anyone`, what `Can.Anyone()` writes), so registering `AuthorizationModule.forRoot()` doesn't lock them; a `@Can()` passed in `decorators` is still enforced. No dependency on `@nestjs/authorization` is added.
- Nothing refuses to boot in production: inbox, SSE and preference routes are scoped to the resolved recipient, and delivery-tracking callbacks stay reachable by the providers (Twilio is signature-verified).

Migration: `guards: [G]` → `decorators: [UseGuards(G)]` (or mount the controller in your own module); `controller: false` → `routes: false`; `controller: { guards, ... }` → `controller: { ... }` plus top-level `decorators`.
