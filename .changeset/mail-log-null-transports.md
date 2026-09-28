---
'@dudousxd/nestjs-notifications-mail': minor
---

- New `LogMailTransport`: logs each message to the Nest logger instead of sending it, as a "log" driver for development.
- New `NullMailTransport`: drops mail and logs the drop at debug level, for environments where outgoing mail is disabled (CI, air-gapped installs without a relay).
- The `smtp` option (and `NodemailerTransport`) now also accept an SMTP connection URL (`smtp://user:pass@host:587`).
