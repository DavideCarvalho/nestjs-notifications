---
name: notifications-mail
description: >-
  Send email notifications in NestJS with @dudousxd/nestjs-notifications-mail. Use when registering
  MailChannelModule.forRoot (from, smtp, transport, renderer, resolveTransport), building the fluent
  MailMessage (subject/greeting/line/action/salutation/from/attach/markdown/react/mjml), implementing
  the MailNotification interface with a @Mail()-decorated toMail(ctx) that returns a MailMessage,
  choosing a renderer (DefaultMailRenderer, MarkdownMailRenderer, ReactEmailRenderer, MjmlMailRenderer),
  and a transport (NodemailerTransport SMTP, SesTransport). Covers per-tenant transports and attachments.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-notifications-mail"
  library_version: 0.8.1
  framework: nestjs
---

# nestjs-notifications — mail channel

The mail channel renders a notification's `MailMessage` and sends it through a pluggable transport.
The recipient address comes from the notifiable's `mail` route (`@RouteFor('mail')` or
`routeNotificationFor('mail')`).

## Setup

```bash
pnpm add @dudousxd/nestjs-notifications-mail
```

```ts
import { MailChannelModule } from '@dudousxd/nestjs-notifications-mail';

@Module({
  imports: [
    MailChannelModule.forRoot({
      from: 'no-reply@example.com', // default sender; a message can override with .from(addr)
      smtp: { host: 'smtp.example.com', port: 587, auth: { user: 'u', pass: 'p' } },
    }),
  ],
})
export class AppModule {}
```

`forRoot` registers globally (`global: true`) and uses `NodemailerTransport` + `DefaultMailRenderer`
unless you override `transport`/`transportInstance` and `renderer`/`rendererInstance`. This module
is a channel for the core engine — it must be imported alongside `NotificationsModule.forRoot()`.

## Core patterns

### 1. A mail notification

Implement `MailNotification` (or just decorate the payload method with `@Mail()`); the method
returns a fluent `MailMessage`. The handler receives a `ctx` carrying the recipient and (when
configured) localization.

```ts
import { Notification } from '@dudousxd/nestjs-notifications-core';
import { Mail, MailMessage, type MailNotification } from '@dudousxd/nestjs-notifications-mail';

@Notification()
export class InvoicePaid implements MailNotification {
  constructor(private readonly invoiceId: string, private readonly amount: number) {}

  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject(`Invoice ${this.invoiceId} paid`)
      .greeting('Thanks for your payment!')
      .line(`We received your payment of $${this.amount.toFixed(2)}.`)
      .action('View invoice', `https://example.com/invoices/${this.invoiceId}`)
      .line('No further action is needed.');
  }
}
```

`MailMessage` is a builder: `.from`, `.subject`, `.greeting`, `.line` (call repeatedly),
`.action(text, url)`, `.salutation`, `.attach`, and the body-format setters `.markdown`,
`.react`, `.mjml`.

### 2. Pick a renderer for richer bodies

The body setter must match the configured renderer. The default renderer only understands
greeting/line/action; `.markdown()/.react()/.mjml()` bodies are honored only by their renderer.

```ts
import {
  MailChannelModule,
  MarkdownMailRenderer,  // renders .markdown(md)
  ReactEmailRenderer,    // renders .react(<Email/>) — needs react + @react-email/render
  MjmlMailRenderer,      // compiles .mjml(markup) — needs the mjml peer
} from '@dudousxd/nestjs-notifications-mail';

MailChannelModule.forRoot({ from: 'a@b.com', renderer: MarkdownMailRenderer, smtp });
```

### 3. Attachments & per-tenant transports

```ts
new MailMessage().subject('Report').attach({ filename: 'report.pdf', content: pdfBuffer });
```

Give each tenant its own SMTP/provider with `resolveTransport`; it is used when a send runs with a
`context.tenant` (`notifications.forTenant(id).send(...)`):

```ts
MailChannelModule.forRoot({
  from: 'a@b.com',
  resolveTransport: (tenant) => tenantTransports[tenant], // returns a MailTransport
});
```

For SES instead of SMTP, use `SesTransport` via `transportInstance`:

```ts
import { SesTransport } from '@dudousxd/nestjs-notifications-mail';
MailChannelModule.forRoot({ from: 'a@b.com', transportInstance: new SesTransport({ client: sesV2Client }) });
```

## Common mistakes

### A rich body with the default renderer

```ts
// Wrong — .markdown() body but DefaultMailRenderer ignores it (renders only greeting/line/action)
MailChannelModule.forRoot({ from: 'a@b.com', smtp });        // default renderer
class N { @Mail() toMail() { return new MailMessage().markdown('# Hi'); } } // body dropped

// Correct — pair the body format with its renderer
MailChannelModule.forRoot({ from: 'a@b.com', smtp, renderer: MarkdownMailRenderer });
```

`DefaultMailRenderer` builds HTML only from greeting/lines/action/salutation; markdown/react/mjml
bodies are renderer-specific. Source: packages/mail/src/renderer.ts, packages/mail/src/mail-message.ts.

### No `mail` route on the notifiable

```ts
// Wrong — nothing tells the channel which address to use; recipient resolves to "undefined"
class User { constructor(public id: number, public email: string) {} }

// Correct — declare the mail address
import { RouteFor } from '@dudousxd/nestjs-notifications-core';
class User { @RouteFor('mail') email!: string; constructor(public id: number, email: string) { this.email = email; } }
```

The channel reads the recipient from `routeFor(notifiable, 'mail')`; with no `@RouteFor('mail')`
(or `routeNotificationFor`) it stringifies `undefined`. Source: packages/mail/src/mail.channel.ts.

### Importing the mail module but not the core engine

```ts
// Wrong — MailChannelModule alone; there is no NotificationService to send with
imports: [MailChannelModule.forRoot({ from: 'a@b.com', smtp })]

// Correct — the channel plugs into the core engine
imports: [NotificationsModule.forRoot(), MailChannelModule.forRoot({ from: 'a@b.com', smtp })]
```

`MailChannel` is a driver discovered by the core runner; without `NotificationsModule` there is no
`NotificationService` and the channel is never invoked. Source: packages/mail/src/mail.module.ts,
README "Quick start".

### Expecting `from` to be mandatory on every message

```ts
// Wrong — assuming each message must set a sender
new MailMessage().from('a@b.com').subject('Hi'); // unnecessary if a module default exists

// Correct — set the default once; override only when needed
MailChannelModule.forRoot({ from: 'no-reply@example.com', smtp });
new MailMessage().subject('Hi'); // uses the module's default `from`
```

The channel falls back to `options.from` when `message.fromAddress` is unset; a per-message `.from()`
is an override, not a requirement. Source: packages/mail/src/mail.channel.ts, packages/mail/src/mail.module.ts.
