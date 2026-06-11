---
'@dudousxd/nestjs-notifications-webhook': minor
---

Sign webhook requests with HMAC-SHA256 — set a `secret` and every request gets an `X-Signature-256: sha256=<hex>` header (header name configurable, per-tenant secrets via `resolveOptions`).
