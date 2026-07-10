---
"@dudousxd/nestjs-notifications-sse": minor
---

Add `redisSseBackplane(createClient, options?)` — a factory for `RedisSseBackplane` that calls `createClient()` twice (one publisher, one subscriber) so the "two separate connections" rule (a client in subscriber mode rejects regular commands) can't be violated by accident. Stays BYO: the package still doesn't depend on `ioredis`, and the consumer keeps full control over client construction/config.
