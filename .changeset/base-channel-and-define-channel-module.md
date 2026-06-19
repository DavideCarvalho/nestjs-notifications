---
"@dudousxd/nestjs-notifications-core": patch
"@dudousxd/nestjs-notifications-slack": patch
"@dudousxd/nestjs-notifications-discord": patch
"@dudousxd/nestjs-notifications-teams": patch
"@dudousxd/nestjs-notifications-telegram": patch
"@dudousxd/nestjs-notifications-webhook": patch
"@dudousxd/nestjs-notifications-mail": patch
"@dudousxd/nestjs-notifications-sms": patch
"@dudousxd/nestjs-notifications-push": patch
---

Internal refactors (behavior-preserving): extract a shared `BaseChannel` + common HTTP helpers to dedupe the 8 channel adapters, and add a `defineChannelModule` factory that the simple HTTP channels (slack/discord/teams/telegram/webhook) delegate to.
