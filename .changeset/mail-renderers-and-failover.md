---
'@dudousxd/nestjs-notifications-mail': minor
---

Add built-in `ReactEmailRenderer` (React Email) and `MjmlMailRenderer` (MJML) renderers, plus `MailMessage.react()` / `.mjml()`. Add `FailoverMailTransport` for multi-provider failover (e.g. SES → Resend) and `transportInstance` / `rendererInstance` module options. `MailRenderer.render` may now be async.
