---
"@dudousxd/nestjs-notifications-mail": minor
---

`url` attachments are downloaded with limits and an SSRF guard. Defaults: `https:` only, hosts that are or resolve to loopback/private/link-local/other non-public addresses are refused (checked at connect time), a 30 s timeout and a 25 MiB cap enforced while streaming; redirects are still refused. Configure with `MailChannelModule.forRoot({ attachments: { allowHttp, allowPrivateHosts, timeoutMs, maxBytes } })`. An `http:` or internal-host attachment that downloaded before now fails until you allow it.
