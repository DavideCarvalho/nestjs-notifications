---
"@dudousxd/nestjs-notifications-core": patch
---

Docs: outbox delivery is at-least-once. Two concurrent deliveries of one message (a relay that lost its lease, parallel relay workers) can both send a channel, and a send whose completion record fails to write is sent again on the next redelivery (under `failFast`, immediately) after its `notification.sent` event was already emitted. Channels rely on the `idempotencyKey` (mail `Message-ID`, webhook `webhook-id`) for receivers to dedupe. The `I18nServiceTranslator` doc now says mail classes get the locale from `mailer.send({ locale })`, not from the ambient context.
