---
"@dudousxd/nestjs-notifications-slack": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-push": minor
"@dudousxd/nestjs-notifications-sms": minor
"@dudousxd/nestjs-notifications-webhook": minor
---

Async per-tenant resolvers and a Slack delivery result.

- **slack**: `resolveOptions` may now be async — `SlackOptionsResolver` is `(tenant) => SlackChannelOptions | Promise<SlackChannelOptions>`. New `SlackChannelModule.forRootAsync({ imports, inject, useFactory })` so the resolver can use injected services.
- **slack**: `SlackChannel.send()` now resolves to a `SlackDeliveryResult`: `{ channel, ts }` from `chat.postMessage` (Web API) or `{ webhook: true }` (incoming webhook). It surfaces as the slack `ChannelResult.response` in the `SendResult`, in `afterSending(notifiable, 'slack', response)` and on the `notification.sent` event.
- **slack**: the Web API answers HTTP 200 with `{ ok: false, error }` on failure — the channel now throws a descriptive error (`Slack chat.postMessage to channel "C404" failed: channel_not_found.`) instead of reporting the delivery as sent.
- **mail / push / sms / webhook**: the per-tenant `resolveTransport` / `resolveOptions` may also return a promise (new exported `MailTransportResolver` type). Sync resolvers keep working unchanged.
