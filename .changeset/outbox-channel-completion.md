---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-webhook": minor
---

Outbox redeliveries no longer repeat channels that already completed, and a retried webhook subscription delivery no longer dispatches its event twice.

- `OutboxNotificationHandler` records every channel that doesn't fail in the outbox inbox store (consumer `aviary.notifications:<channel>`, id `<outbox message id>:<notifiable type>#<id>`). A redelivery (a `failFast` retry, a crash, a lost lease) skips the recorded channels and reports them as `suppressed`. The records are durable with a SQL inbox store (`PostgresOutboxStore`, `MySqlOutboxStore`) and in-process with the in-memory default; `OutboxInbox.prune()` removes them.
- `ChannelRunner.run()` takes an optional `ChannelCompletionLog` (`isComplete(channel)`, `markComplete(channel)`), the hook the handler uses; custom dispatchers that redeliver whole jobs can pass their own.
- Webhook subscription delivery with an `idempotencyKey` records its `webhook-id` through `OutboxInbox.processInTransaction()` in the dispatch transaction (consumer `WEBHOOK_DISPATCH_CONSUMER`). A retry dispatches nothing and responds `{ id, duplicate: true }` (`WebhookAlreadyDispatched`) instead of adding the same id to the outbox again.
