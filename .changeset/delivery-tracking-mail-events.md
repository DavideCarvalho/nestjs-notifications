---
"@dudousxd/nestjs-notifications-delivery-tracking": minor
---

New `@dudousxd/nestjs-notifications-delivery-tracking/mail` subpath: `mailDeliveryTracking()` records the mail `@nestjs/mail` sends outside notifications (from `MailEvents`, with the provider message id, so SES bounces correlate). Notification mail is skipped there, since the notification listener records it. Optional peers: `@nestjs/mail`, `@dudousxd/nestjs-notifications-mail`.
