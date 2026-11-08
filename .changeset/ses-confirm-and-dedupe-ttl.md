---
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

SES controller: the `MessageId` dedupe window is its own option, `messageIdTtlMs` (default 24 h, never shorter than `maxMessageAgeMs`), instead of following `maxMessageAgeMs` (and falling back to 1 h under `maxMessageAgeMs: false`). The `autoConfirmSubscription` GET refuses redirects and times out (`confirmTimeoutMs`, default 5 s), and a failed confirmation answers `502` so SNS redelivers it, instead of a `204` that left the subscription pending.
