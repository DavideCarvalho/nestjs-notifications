---
"@dudousxd/nestjs-notifications-sms": minor
---

Add `transportInstance` to `SmsChannelModule.forRoot` — a pre-built transport instance that takes precedence over the `transport` class. This makes `FailoverSmsTransport` (which needs its provider list at construction time) usable through the public module API, mirroring the mail channel's `transportInstance`. Enables multi-provider SMS failover.
