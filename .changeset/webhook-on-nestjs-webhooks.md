---
"@dudousxd/nestjs-notifications-webhook": minor
---

**Breaking.** Webhook delivery builds on `@nestjs/webhooks` (peer ~0.0.4, Nest `^12`).

- Direct-URL delivery POSTs through `HttpWebhookTransport`: https only, every resolved address checked and pinned, redirects never followed. `delivery` passes its options (`allowHttp`, `allowPrivateNetworks`, `allowedAddresses`, `ca`, …); `transport` overrides it (e.g. `InMemoryWebhookTransport` in tests).
- `signing: 'standard'` signs with Standard Webhooks headers, verifiable with `@VerifyWebhook()`; `sha256=` stays the default. The `webhook-id` is the delivery's idempotency key when present.
- Subscription delivery: return `new WebhookEvent(type, data)` and it is dispatched with `Webhooks.dispatch(tx, { type, data, tenant })` (needs `WebhooksModule`, `OutboxModule` and `forRoot({ transaction })`).
- Removed: `WebhookMessage.method()`/`methodValue` (always POST), the `redirect` option. Headers are sent lower-case; the channel returns `{ id, statusCode }`; `timeoutMs` defaults to 15000.

Migration: drop `redirect` and `.method()`; for http or private targets in development, set `delivery: { allowHttp: true, allowPrivateNetworks: true }`.
