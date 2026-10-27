---
"@dudousxd/nestjs-notifications-preferences": minor
---

**Bug fix that changes which notifications are delivered.** `PreferencesModule.forRoot()`, `forCenter()` and `forDigest()` bound the core `NOTIFICATION_PREFERENCE_GATE` / `NOTIFICATION_DIGEST_SINK` tokens without exporting them, so the `ChannelRunner` inside `NotificationsModule` never saw them: muted channels, preference-center toggles, `off`/digest cadences and quiet hours were all ignored and every channel was delivered. The modules now export those tokens, so deliveries honour the stored preferences as documented: a channel a user turned off is skipped, and a `daily`/`weekly` category is collected into its digest.
