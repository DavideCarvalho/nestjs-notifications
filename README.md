# nestjs-notifications

Laravel-style notifications for NestJS. Define a notification once and send it across many
channels — mail, database, broadcast, Slack — synchronously or through a pluggable async
dispatcher (in-process events, Redis, or your app's existing BullMQ setup).

📚 **Documentation: https://davidecarvalho.github.io/nestjs-notifications/**

```ts
class InvoicePaid implements Notification, MailNotification, DatabaseNotification {
  constructor(private invoice: Invoice) {}
  via() { return ['mail', 'database']; }
  toMail() { return new MailMessage().subject('Paid!').line('Thanks for your payment.'); }
  toDatabase() { return { invoiceId: this.invoice.id }; }
}

await notifications.send(user, new InvoicePaid(invoice));
```

## Why

- **Faithful to Laravel** — `send`, `via`, `toMail`, on-demand routing, queued notifications.
- **Decoupled core** — the core knows only interfaces; every channel and dispatcher is an
  opt-in package.
- **Type-safe payloads** — each channel exports an interface your notification implements,
  so `toMail`/`toDatabase`/`toSlack` are checked at compile time.
- **Observable** — lifecycle events plus a first-class [nestjs-telescope](https://github.com/DavideCarvalho/nestjs-telescope) watcher.

## Packages

| Package | What it does |
| --- | --- |
| `@dudousxd/nestjs-notifications-core` | Abstractions, `NotificationService`, synchronous dispatcher, events |
| `@dudousxd/nestjs-notifications-mail` | Mail channel — fluent `MailMessage`, pluggable transport & renderer |
| `@dudousxd/nestjs-notifications-database` | Database channel — `NotificationStore` + in-memory store |
| `@dudousxd/nestjs-notifications-database-typeorm` | TypeORM adapter for the database channel |
| `@dudousxd/nestjs-notifications-database-mikro-orm` | MikroORM adapter for the database channel |
| `@dudousxd/nestjs-notifications-broadcast` | WebSocket (socket.io) channel for realtime in-app notifications |
| `@dudousxd/nestjs-notifications-slack` | Slack channel — webhook or bot token |
| `@dudousxd/nestjs-notifications-event-emitter` | In-process async dispatch via `@nestjs/event-emitter` |
| `@dudousxd/nestjs-notifications-bullmq` | Async dispatch reusing your app's BullMQ |
| `@dudousxd/nestjs-notifications-redis` | Async dispatch via Redis for a dedicated worker |
| `@dudousxd/nestjs-notifications-telescope` | nestjs-telescope watcher — see every send in the dashboard |
| `@dudousxd/nestjs-notifications-testing` | `NotificationFake` + Laravel-style assertions |

## Install

```bash
pnpm add @dudousxd/nestjs-notifications-core @dudousxd/nestjs-notifications-mail @nestjs/event-emitter
```

## Quick start

```ts
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    NotificationsModule.forRoot({ notifications: [InvoicePaid] }),
    MailChannelModule.forRoot({
      from: 'billing@example.com',
      smtp: { host: 'smtp.example.com', port: 587, auth: { user, pass } },
    }),
    DatabaseChannelModule.forRoot(), // in-memory; pair with an ORM adapter for persistence
  ],
})
export class AppModule {}
```

```ts
@Injectable()
class BillingService {
  constructor(private readonly notifications: NotificationService) {}

  async paid(user: User, invoice: Invoice) {
    await this.notifications.send(user, new InvoicePaid(invoice));
    // on-demand, no Notifiable entity:
    await this.notifications.route('mail', 'ops@example.com').notify(new InvoicePaid(invoice));
  }
}
```

A recipient implements `Notifiable`:

```ts
class User implements Notifiable {
  constructor(public id: number, public email: string) {}
  routeNotificationFor(channel: string) {
    return channel === 'mail' ? this.email : undefined;
  }
  toNotifiableRef() { return { type: 'User', id: this.id }; } // needed for async dispatch
}
```

## Two orthogonal abstractions

1. **Channel drivers** — *how* a notification leaves (mail, database, broadcast, slack).
2. **Dispatch drivers** — *where/when* it is processed (sync inline, in-process events,
   Redis, BullMQ).

They are independent: you can send by mail (channel) asynchronously through BullMQ (dispatch).

### Async delivery

Set `shouldQueue` on the notification and choose a dispatcher:

```ts
NotificationsModule.forRoot({
  ...bullmqDispatcher(),                 // from @dudousxd/nestjs-notifications-bullmq
  imports: [/* BullModule.forRoot(...) */],
  notifications: [InvoicePaid],          // registry used to rehydrate in the worker
  resolveNotifiable: (ref) => userRepo.findOneBy({ id: Number(ref.id) }),
});
```

The notification is serialized as `{ name, data }`; the notifiable as a `{ type, id }`
reference rebuilt by `resolveNotifiable`. The synchronous path needs none of this.

## Telescope integration

```ts
TelescopeModule.forRoot({ watchers: [new NotificationsWatcher()] });
```

Every `notification.sent` / `notification.failed` shows up as a `notification` entry —
channel, recipient, notification class, payload, and failure reason.

## Testing

```ts
const fake = new NotificationFake();
// ...override NotificationService with the fake...
fake.assertSentTo(user, InvoicePaid);
fake.assertSentOnChannel('mail');
```

## Development

```bash
pnpm install
pnpm build        # turbo, topological
pnpm test         # vitest across all packages
pnpm lint         # biome
```

See [`docs/plans`](./docs/plans) for the design document and [`examples/basic`](./examples/basic)
for a runnable end-to-end app.

## License

MIT © Davide Carvalho
