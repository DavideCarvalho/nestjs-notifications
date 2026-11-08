---
"@dudousxd/nestjs-notifications-mail": minor
---

**Breaking.** The mail channel sends through `@nestjs/mail`'s `Mailer`; Aviary's transports are removed.

- Configure `MailModule.forRoot({ transport, from, retry })` from `@nestjs/mail` (peer ~0.0.2, Nest `^11 || ^12`); `MailChannelModule.forRoot({ renderer?, rendererInstance?, retry?, global? })` keeps rendering.
- Removed: `NodemailerTransport`, `SesTransport`, `composeRawEmail`, `LogMailTransport`, `NullMailTransport`, the `MailTransport`/`MailTransportPayload`/`SMTPOptions` types, `MAIL_TRANSPORT`, `MAIL_SMTP_OPTIONS`, `MAIL_TRANSPORT_RESOLVER`, and the `from`/`smtp`/`transport`/`transportInstance`/`resolveTransport` options; the `nodemailer` and `@aws-sdk/client-sesv2` peers.
- `toMail()` may return `{ mail: MailClass, data }` (a `@nestjs/mail` mail class, sent in the recipient's locale).
- The channel returns `MailSendResult`, so delivery tracking records the provider message id (SES bounces now correlate); it forwards the delivery `idempotencyKey` and the optional `retry`.
- `TenantRoutingMailTransport` picks a tenant's transport per message from an AsyncLocalStorage mail scope (`runInMailScope`, `currentMailScope`).
- `MailMessage.replyTo()` and `.header()`; `attach({ filename, url })` downloads the file (`@nestjs/mail`'s `path` is local only).

Migration: `MailChannelModule.forRoot({ from, smtp })` → `MailModule.forRoot({ from, transport: new SmtpTransport(smtp) })` + `MailChannelModule.forRoot()`; `resolveTransport` → `new TenantRoutingMailTransport(resolve, fallback)`; `SesTransport({ client })` → `@nestjs/mail`'s `SesTransport({ region })`.
