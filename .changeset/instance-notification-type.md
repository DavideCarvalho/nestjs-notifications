---
"@dudousxd/nestjs-notifications-core": minor
---

Add `notificationType()` — an optional per-INSTANCE override for a notification's display/persistence name (`notificationName()` in `base-channel.ts`), for consumers with one generic notification class carrying many event names in its instance data. Precedence: `notificationType()` > class-level `@Notification({ name })` > class name. The async dispatch rehydration registry is unaffected — it still keys strictly off the class-level name, since an instance-level type is data, not a class identity.

Add `emitter?: boolean` to `NotificationsModule.forRoot`/`forRootAsync` options. When `true`, the module registers `EventEmitterModule.forRoot()` for you (core's `ChannelRunner` injects `EventEmitter2` regardless of this flag, so something has to call it). Defaults to `false` — an app that already calls `EventEmitterModule.forRoot()` elsewhere must not register it twice — so today's explicit-wiring behavior is unchanged unless you opt in.
