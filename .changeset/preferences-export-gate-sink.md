---
"@dudousxd/nestjs-notifications-preferences": patch
---

Fix: preferences, the preference center and digests now actually apply under real Nest DI. `PreferencesModule.forRoot()` / `forCenter()` bound the core `NOTIFICATION_PREFERENCE_GATE` token but did not export it, and neither did `forDigest()` for `NOTIFICATION_DIGEST_SINK`. The core `ChannelRunner` lives in `NotificationsModule` and injects those tokens with `@Optional()`, so it silently got `undefined`. Muted channels and disabled toggles were still delivered, and digest-cadence notifications were dropped instead of collected. The (global) modules now export those tokens. An integration test boots `NotificationsModule` + `PreferencesModule` through `Test.createTestingModule` to cover it.
