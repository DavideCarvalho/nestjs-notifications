---
"@dudousxd/nestjs-notifications-core": minor
"@dudousxd/nestjs-notifications-mail": minor
"@dudousxd/nestjs-notifications-sms": minor
"@dudousxd/nestjs-notifications-slack": minor
"@dudousxd/nestjs-notifications-webhook": minor
"@dudousxd/nestjs-notifications-push": minor
---

Per-tenant channel config, rich email, and an app-wide preference gate.

- **Per-tenant config**: mail/sms/push take `resolveTransport(tenant)` and slack/webhook take
  `resolveOptions(tenant)` — a send scoped with `forTenant(id)` uses that tenant's credentials,
  falling back to the default when none.
- **Rich email**: `MarkdownMailRenderer` + `MailMessage.markdown()` render Markdown to HTML (via
  the optional `marked` peer).
- **Preference gate**: core gained an optional `PreferenceGate` (token
  `NOTIFICATION_PREFERENCE_GATE`) consulted before every channel delivery — muted channels are
  reported as `skipped`. See the new `@dudousxd/nestjs-notifications-preferences` package.
