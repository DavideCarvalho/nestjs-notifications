---
"@dudousxd/nestjs-notifications-webhook": patch
---

A subscription delivery's `webhook-id` no longer collides for distinct idempotency keys: a key that isn't header-safe or would exceed 128 characters is hashed (`msgh_<sha256>`) instead of having characters replaced by `_` and being truncated, which reported the second delivery as `duplicate`. Short, safe keys (outbox message ids) keep `msg_<key>`. Direct delivery now caches one `HttpWebhookTransport` per tenant, rebuilt only when that tenant's `delivery` options change, so a resolver returning a fresh object per call no longer builds a transport per send.
