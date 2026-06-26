---
name: notifications-core
description: >-
  Send Laravel-style notifications in NestJS with @dudousxd/nestjs-notifications-core.
  Use when setting up NotificationsModule.forRoot/forRootAsync, defining a Notification
  (channel inference via @Mail()/@Database() decorators vs explicit via()), a Notifiable
  (@RouteFor/@NotifiableId/@Notifiable or routeNotificationFor), injecting NotificationService
  and calling send/notify/sendNow/route/forTenant/only/except, reading SendResult/ChannelResult
  status, on-demand routing without an entity, shouldSend gating, and lifecycle events
  notification.sending/sent/failed. Covers ChannelNotRegisteredError and MissingChannelMethodError.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-notifications-core"
  library_version: 0.8.1
  framework: nestjs
---

# nestjs-notifications — core

Define a notification once, fan it out across many channels. The core knows only interfaces;
each channel (mail, database, slack, …) and each dispatch driver is an opt-in package. This skill
covers the engine: module wiring, the `Notification`/`Notifiable` contracts, and `NotificationService`.

## Setup

Install core, at least one channel, and `@nestjs/event-emitter` (a core peer, used for lifecycle
events):

```bash
pnpm add @dudousxd/nestjs-notifications-core @dudousxd/nestjs-notifications-mail @nestjs/event-emitter
```

```ts
// app.module.ts
import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import { MailChannelModule } from '@dudousxd/nestjs-notifications-mail';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { InvoicePaid } from './notifications/invoice-paid.notification';

@Module({
  imports: [
    EventEmitterModule.forRoot(), // required: lifecycle events use @nestjs/event-emitter
    NotificationsModule.forRoot({
      notifications: [InvoicePaid], // only needed for async dispatch; harmless otherwise
    }),
    MailChannelModule.forRoot({
      from: 'billing@example.com',
      smtp: { host: 'smtp.example.com', port: 587, auth: { user: 'u', pass: 'p' } },
    }),
  ],
})
export class AppModule {}
```

`forRoot` registers globally by default (`global: true`), so `NotificationService` is injectable
everywhere. For config that depends on other providers, use `forRootAsync({ imports, useFactory,
inject })`.

## Core patterns

### 1. Define a Notification — channels inferred from decorators

Annotate each payload method with its channel handle; `via()` is then inferred, so there is no
magic-string list to keep in sync. The payload method name is conventionally `to<Channel>`.

```ts
import { Notification } from '@dudousxd/nestjs-notifications-core';
import { Database } from '@dudousxd/nestjs-notifications-database';
import { Mail, MailMessage } from '@dudousxd/nestjs-notifications-mail';

@Notification() // optional marker; pin a stable name with @Notification({ name: 'invoice.paid' })
export class InvoicePaid {
  constructor(
    public readonly invoiceId: string,
    public readonly amount: number,
  ) {}

  @Mail()
  toMail(): MailMessage {
    return new MailMessage()
      .subject(`Invoice ${this.invoiceId} paid`)
      .line(`We received $${this.amount.toFixed(2)}.`);
  }

  @Database()
  toDatabase(): Record<string, unknown> {
    return { invoiceId: this.invoiceId, amount: this.amount };
  }
}
```

When routing must vary per recipient, implement `via()` instead (it overrides decorator inference)
and you may return channel names or the exported handles:

```ts
import type { ChannelRef, Notifiable } from '@dudousxd/nestjs-notifications-core';

via(notifiable: Notifiable): Array<string | ChannelRef> {
  return (notifiable as User).prefersSms ? [Sms] : [Mail, Database];
}
```

### 2. Define a Notifiable — per-channel addresses

Declare addresses with `@RouteFor(channel)`; mark the id with `@NotifiableId()` and pin a morph
`type` with `@Notifiable({ type })` (both only needed for async dispatch).

```ts
import { Notifiable, NotifiableId, RouteFor } from '@dudousxd/nestjs-notifications-core';

@Notifiable()
export class User {
  @NotifiableId() id: number;
  @RouteFor('mail') email: string;
  @RouteFor('sms') phone?: string;

  constructor(id: number, email: string) {
    this.id = id;
    this.email = email;
  }
}
```

For computed/dynamic routing, implement `routeNotificationFor(channel, notification)` — it
overrides `@RouteFor`. Returning `undefined` for a channel means "no address".

### 3. Send — and read the result

`NotificationService.send` never throws on a single channel failure (default
`errorPolicy: 'continueOnError'`); inspect the returned `SendResult[]`.

```ts
import { Injectable } from '@nestjs/common';
import { NotificationService } from '@dudousxd/nestjs-notifications-core';

@Injectable()
export class BillingService {
  constructor(private readonly notifications: NotificationService) {}

  async paid(user: User, invoiceId: string, amount: number) {
    const [result] = await this.notifications.send(user, new InvoicePaid(invoiceId, amount));
    // result.results: ChannelResult[] -> { channel, status, response?, error? }
    const failed = result.results.filter((r) => r.status === 'failed');

    // On-demand: no Notifiable object, route a raw value
    await this.notifications.route('mail', 'ops@example.com').notify(new InvoicePaid(invoiceId, amount));
  }
}
```

`status` is one of `sent | failed | skipped | queued | suppressed | throttled | deferred`. Scope a
send with the chainable refiners (each returns a `ScopedNotifier`):

```ts
await this.notifications.forTenant('acme').send(user, new InvoicePaid(id, amt));
await this.notifications.only(['mail']).send(user, new InvoicePaid(id, amt));   // ad-hoc allow-list
await this.notifications.except(['sms']).send(user, new Welcome());            // ad-hoc deny-list
await this.notifications.sendNow(user, n); // force inline, ignore shouldQueue/delay
```

Skip a channel per-recipient at delivery time with `shouldSend(notifiable, channel)` on the
notification (returns `false` -> recorded as `skipped`).

## Common mistakes

### Routing to a channel whose module is not imported

```ts
// Wrong — @Slack() used but SlackChannelModule never imported
@Module({ imports: [NotificationsModule.forRoot()] })
export class AppModule {}
// -> ChannelNotRegisteredError: No driver registered for channel "slack".

// Correct — import every channel module you route to
@Module({ imports: [NotificationsModule.forRoot(), SlackChannelModule.forRoot({ /* ... */ })] })
export class AppModule {}
```

Each channel is a separate provider discovered at runtime; a decorator only names the channel, it
does not register a driver. Source: packages/core/src/errors.ts (`ChannelNotRegisteredError`).

### Decorating a channel without implementing its payload method

```ts
// Wrong — @Mail() present but no toMail()
@Notification()
class Welcome {
  @Mail() build() { /* misnamed */ return new MailMessage(); }
}
// -> MissingChannelMethodError: ... does not implement toMail().

// Correct — the decorated method IS the payload builder (or name it toMail by convention)
@Notification()
class Welcome {
  @Mail() toMail() { return new MailMessage().subject('Hi'); }
}
```

The channel looks up the decorator-mapped method, falling back to the `to<Channel>` convention name;
neither present throws. Source: packages/core/src/base-channel.ts, packages/core/src/decorators.ts.

### Treating `send()` as throw-on-failure

```ts
// Wrong — a failed channel is swallowed, this try/catch never fires
try { await this.notifications.send(user, n); } catch { /* never reached for channel errors */ }

// Correct — inspect per-channel status
const [{ results }] = await this.notifications.send(user, n);
if (results.some((r) => r.status === 'failed')) { /* handle */ }
```

The default `errorPolicy` is `continueOnError`: every channel is attempted and failures are reported
per-channel, not thrown. Source: packages/core/src/options.ts, packages/core/src/notification.service.ts.

### Forgetting `EventEmitterModule.forRoot()`

```ts
// Wrong — core's lifecycle events (notification.sending/sent/failed) have no emitter
imports: [NotificationsModule.forRoot()]

// Correct
imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot()]
```

`@nestjs/event-emitter` is a core peer dependency; without `forRoot()` the lifecycle events
(and any watcher/telescope integration listening on them) never fire. Source: packages/core/package.json
peerDependencies, packages/core/src/events.ts, examples/basic/src/app.module.ts.
