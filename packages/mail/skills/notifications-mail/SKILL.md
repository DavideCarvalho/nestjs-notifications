---
name: notifications-mail
description: >-
  Send email notifications in NestJS with @dudousxd/nestjs-notifications-mail on top of @nestjs/mail.
  Use when registering MailChannelModule.forRoot (renderer, retry) next to @nestjs/mail's
  MailModule.forRoot (transport, from, retry), building the fluent MailMessage
  (subject/greeting/line/action/salutation/from/replyTo/header/attach/markdown/react/mjml), returning a
  @nestjs/mail mail class from toMail ({ mail, data }), choosing a renderer (DefaultMailRenderer,
  MarkdownMailRenderer, ReactEmailRenderer, MjmlMailRenderer), per-tenant transports
  (TenantRoutingMailTransport), URL attachments, and testing with InMemoryMailTransport.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-notifications-mail"
  library_version: 0.10.0
  framework: nestjs
---

# nestjs-notifications — mail channel

The mail channel builds a notification's email and sends it with `@nestjs/mail`'s `Mailer`.
`@nestjs/mail` owns transports (SMTP, Resend, Postmark, SendGrid, SES, log, file, in-memory), the
default `from`, retries and `MailEvents` (https://docs.nestjs.com/application/mail). The recipient
comes from the notifiable's `mail` route (`@RouteFor('mail')` or `routeNotificationFor('mail')`).

## Setup

```bash
pnpm add @dudousxd/nestjs-notifications-mail @nestjs/mail
```

```ts
import { MailModule, SmtpTransport } from '@nestjs/mail';
import { MailChannelModule } from '@dudousxd/nestjs-notifications-mail';

@Module({
  imports: [
    NotificationsModule.forRoot(),
    MailModule.forRoot({
      transport: new SmtpTransport({ host: 'smtp.example.com', port: 587, auth: { user: 'u', pass: 'p' } }),
      from: 'no-reply@example.com', // default sender; a message can override with .from(addr)
    }),
    MailChannelModule.forRoot(), // { renderer?, rendererInstance?, retry?, global? }
  ],
})
export class AppModule {}
```

## Core patterns

### 1. A mail notification

```ts
import { Notification } from '@dudousxd/nestjs-notifications-core';
import { Mail, MailMessage, type MailNotification } from '@dudousxd/nestjs-notifications-mail';

@Notification()
export class InvoicePaid implements MailNotification {
  constructor(private readonly invoiceId: string) {}

  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject(`Invoice ${this.invoiceId} paid`)
      .greeting('Thanks for your payment!')
      .action('View invoice', `https://example.com/invoices/${this.invoiceId}`);
  }
}
```

Builder: `.from`, `.replyTo`, `.header(name, value)`, `.subject`, `.greeting`, `.line` (repeat),
`.action(text, url)`, `.salutation`, `.attach`, and the body setters `.markdown`, `.react`, `.mjml`.

### 2. A @nestjs/mail mail class instead

```ts
@Mail()
toMail() {
  return { mail: OrderShippedMail, data: this.order }; // sent in the recipient's locale
}
```

### 3. Renderers

The body setter must match the renderer: `MarkdownMailRenderer` (`.markdown`, needs `marked`),
`ReactEmailRenderer` (`.react`, needs `react` + `@react-email/render`), `MjmlMailRenderer` (`.mjml`,
needs `mjml`). Each falls back to `DefaultMailRenderer` for a message without its body.

```ts
MailChannelModule.forRoot({ renderer: MarkdownMailRenderer });
```

### 4. Attachments, tenants, retries

```ts
new MailMessage().attach({ filename: 'report.pdf', content: pdfBuffer });       // or a local `path`
new MailMessage().attach({ filename: 'report.pdf', url: 'https://files.example.com/r.pdf' }); // downloaded
```

Per-tenant provider: give `MailModule` a `TenantRoutingMailTransport((tenant) => transports.get(tenant), fallback)`;
the tenant of `notifications.forTenant(id).send(...)` reaches it through an AsyncLocalStorage scope.

With a retrying queue (BullMQ, outbox + failFast) set `MailChannelModule.forRoot({ retry: false })`.

### 5. Testing

```ts
const mailbox = new InMemoryMailTransport(); // from @nestjs/mail
MailModule.forRoot({ transport: mailbox });
mailbox.assertSent({ to: 'ada@example.com' });
```

## Common mistakes

### Configuring a transport on the channel

```ts
// Wrong — removed in 0.10: smtp / transport / transportInstance / from / resolveTransport
MailChannelModule.forRoot({ from: 'a@b.com', smtp });

// Correct — MailModule (from @nestjs/mail) sends; the channel renders
MailModule.forRoot({ transport: new SmtpTransport(smtp), from: 'a@b.com' });
MailChannelModule.forRoot();
```

### Forgetting MailModule

`MailChannel` injects `@nestjs/mail`'s `Mailer`; without `MailModule.forRoot()` the app fails to
boot. Source: packages/mail/src/mail.channel.ts.

### A rich body with the default renderer

`DefaultMailRenderer` renders only greeting/lines/action/salutation; a `.markdown()` body needs
`renderer: MarkdownMailRenderer`. Source: packages/mail/src/renderer.ts.

### No `mail` route on the notifiable

The channel throws "needs a recipient" when `routeFor(notifiable, 'mail')` is not an address,
`{ name, address }` or a list. Declare `@RouteFor('mail') email`. Source: packages/mail/src/mail.channel.ts.
