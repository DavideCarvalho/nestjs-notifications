---
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

**Breaking.** `createSesNotificationController()` now verifies every Amazon SNS message, and refuses with `403` (recording nothing) any message it can't verify. Before, `verifySignature: true` only logged a warning and anyone who could reach the path could post forged bounce/delivery events.

- SNS signatures are checked with AWS's documented algorithm: the canonical string-to-sign per message type, `SignatureVersion` `1` (SHA1withRSA) or `2` (SHA256withRSA), any other version refused. The signing certificate is fetched only from an `https://sns.<region>.amazonaws.com[.cn]/….pem` URL (checked before any request), with a timeout (`certificateTimeoutMs`, default 5000), and cached by URL (bounded).
- New required `topicArns: string[]`: messages (including subscription confirmations) from any other topic are refused.
- `maxMessageAgeMs` (default one hour, `false` to skip) refuses stale or far-future `Timestamp`s.
- Notifications are deduplicated by `MessageId` (in-memory by default; `messageIdStore` for your own, `false` to turn off).
- `SubscriptionConfirmation` is acted on only after verification: `onSubscriptionConfirmation(message)` hook, and `autoConfirmSubscription` GETs the `SubscribeURL` only when it is an SNS host.
- SNS's `Content-Type: text/plain` bodies are read whatever body parser the app uses.
- `verifySignature` now defaults to `true`; `false` skips only the signature (for a verifying gateway in front).
- `certificateLoader` and `fetch` can be injected for tests. `SnsMessageVerifier`, `buildSnsStringToSign`, `isSnsUrl`, `parseSnsMessage` and `InMemorySnsMessageIdStore` are exported.

Migration: `createSesNotificationController({ ... })` → `createSesNotificationController({ topicArns: ['arn:aws:sns:<region>:<account>:<topic>'], ... })`.
