---
'@dudousxd/nestjs-notifications-webhook': minor
'@dudousxd/nestjs-notifications-core': minor
---

Webhook channel hardening:

- **Fix:** `WebhookChannelModule.forRoot()` now accepts and forwards `secret` and `signatureHeader`. The docs showed `forRoot({ secret })` turning on HMAC signing, but the module dropped both options, so signing only worked through `resolveOptions`.
- New `timeoutMs` option. It aborts a request that takes too long, so a hung receiver no longer holds the delivery indefinitely.
- New `redirect` option (`'follow'` by default, or `'error'` / `'manual'`). Use `'error'` when webhook URLs come from users, so a 3xx can't bounce the signed request to another host.
- Core: `postJson` gains optional `timeoutMs` / `redirect`. Both are additive, and the defaults are unchanged.
