---
'@dudousxd/nestjs-notifications-mail': minor
---

Add attachment support to the mail channel. `MailMessage.attach({ filename, content?, path?, contentType?, cid? })` adds files, carried through `MailTransportPayload.attachments` to the transport; `NodemailerTransport` maps them to nodemailer attachments. The new `MailAttachment` type is exported. Renderers ignore attachments (they're not part of the body).
