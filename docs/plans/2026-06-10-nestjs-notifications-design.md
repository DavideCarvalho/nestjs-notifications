# nestjs-notifications — Design

Laravel-style notifications for NestJS. Define a notification once, send it across
many channels (mail, database, broadcast, slack…), synchronously or via a pluggable
async dispatcher (in-process events, Redis, or the app's existing BullMQ setup).

## Goals

- Fidelity to Laravel's notification ergonomics (`notify`, `via`, `toMail`, on-demand routing).
- Fully decoupled core: it knows only *interfaces*, never a concrete channel/dispatcher/ORM.
- One package per channel and per dispatch driver — everything opt-in.
- Type-safe per-channel payload methods.
- First-class testing utilities.

## Two orthogonal abstractions

1. **Channel drivers** — *how* a notification leaves (mail, database, broadcast, slack).
2. **Dispatch drivers** — *where/when* processing runs (sync inline, in-process events,
   Redis, BullMQ). Independent of channels: you can send by mail (channel) asynchronously
   through BullMQ (dispatch).

## Monorepo layout

Same stack as `nestjs-inertia`: pnpm workspaces + Turborepo + Vitest + Biome + Changesets.

```
packages/
  core/                 @dudousxd/nestjs-notifications-core      interfaces, NotificationService, SyncDispatcher, events, DI tokens
  event-emitter/        in-process async via @nestjs/event-emitter
  bullmq/               async via the app's existing @nestjs/bullmq queue
  redis/                async via Redis stream / pub-sub for dedicated workers
  mail/                 MailMessage builder, pluggable transport + renderer (Nodemailer first)
  database/             NotificationStore interface + InMemoryStore
  database-mikro-orm/   MikroORM adapter for NotificationStore
  database-typeorm/     TypeORM adapter for NotificationStore
  broadcast/            WebSocket gateway channel (socket.io)
  slack/                Slack channel (webhook / bot token)
  testing/              NotificationFake + Laravel-style assertions
examples/basic/         end-to-end Nest app (mail + database + bullmq)
docs/  website/  scripts/
turbo.json  pnpm-workspace.yaml  tsconfig.base.json  biome.json  vitest config
```

`database-prisma` is a future package against the same `NotificationStore` interface.

## Core contracts

```ts
interface Notifiable {
  routeNotificationFor(channel: string, notification: Notification): unknown;
  // optional: lets async dispatchers persist a reference instead of the whole object
  toNotifiableRef?(): NotifiableRef; // { type: string; id: string | number }
}

interface Notification {
  via(notifiable: Notifiable): string[];
  shouldQueue?: boolean;            // route through the async dispatch driver
  queue?: string;                   // optional queue/driver hint
  // serialization hooks for async (default: structural over public fields)
  serialize?(): Record<string, unknown>;
  // per-channel payload methods are optional & typed by each channel package
  // toMail / toDatabase / toBroadcast / toSlack ...
}

interface ChannelDriver {
  readonly channel: string;
  send(notifiable: Notifiable, notification: Notification): Promise<void>;
}

interface DispatchDriver {
  dispatch(job: NotificationJob): Promise<void>;
}

interface NotificationJob {
  notifiable: Notifiable | NotifiableRef;
  notification: Notification | SerializedNotification;
  channels: string[];
}
```

**Channel ↔ method binding.** Like Laravel's `to{Channel}` convention, but type-safe:
each channel package exports an interface a notification optionally implements.

```ts
class InvoicePaid implements Notification, MailNotification, DatabaseNotification {
  constructor(private invoice: Invoice) {}
  via() { return ['mail', 'database']; }
  toMail(n: Notifiable) {
    return new MailMessage().subject('Paid!').line('Your invoice was paid.');
  }
  toDatabase() { return { invoiceId: this.invoice.id }; }
}
```

`MailChannel` reads `notification.toMail`; missing method → clear runtime error.

## NotificationService API

```ts
notify(notifiable | notifiable[], notification): Promise<void>;  // sync unless shouldQueue
notifyNow(notifiable, notification): Promise<void>;              // force inline
notifyAsync(notifiable, notification): Promise<void>;            // force dispatch driver
route(channel, routeValue): PendingNotification;                 // on-demand (no Notifiable)
```

`notify()` inspects `notification.shouldQueue`. `false` (default) → `SyncDispatcher` runs
channels inline. `true` → configured `DispatchDriver` enqueues.

## Async rehydration

Across a process boundary the class instance and entity no longer exist — only JSON.

- **Notification**: serialized as `{ name, data }`. A `notifications: [InvoicePaid, …]`
  registry maps name → class; default deserialization is structural over public fields,
  overridable via `serialize()` / `static deserialize()`.
- **Notifiable**: serialized as a `NotifiableRef` (`{ type, id }`) via `toNotifiableRef()`;
  a configured `resolveNotifiable(ref)` reloads it in the worker.

Sync path needs none of this — objects are passed directly. Cost only appears for async.

```ts
NotificationsModule.forRoot({
  dispatcher: BullMQDispatcher,            // default SyncDispatcher
  channels: [MailChannel, DatabaseChannel],
  notifications: [InvoicePaid],            // rehydration registry
  resolveNotifiable: async (ref) => userRepo.findOne(ref.id),
});
```

## Channels

- **Mail** — fluent `MailMessage` (`subject/greeting/line/action/line`), pluggable
  `MailRenderer` (Handlebars/MJML/react-email) and `MailTransport` (Nodemailer first).
- **Database** — `NotificationStore` (`save/markAsRead/markAllAsRead/getForNotifiable/
  getUnread/delete`); `InMemoryStore` bundled; MikroORM/TypeORM adapters with a
  `DatabaseNotification` entity mirroring Laravel's schema.
- **Broadcast** — `NotificationsGateway` (socket.io), emits to the notifiable's room/userId.
- **Slack** — `SlackMessage` blocks builder, webhook or bot token.

## Events & error handling

- Events via `@nestjs/event-emitter`: `notification.sending`, `notification.sent`,
  `notification.failed`.
- Per-channel isolation: one channel failing does not block others (`Promise.allSettled`).
  Policy `continueOnError` (default) | `failFast`. Failures emit `failed` and (async) use
  the driver's retry/backoff.

## Dispatch drivers

- `SyncDispatcher` (core) — inline, `Promise.allSettled` across channels.
- `event-emitter` — in-process, non-blocking, same process.
- `bullmq` — enqueues, reusing the app's existing `@nestjs/bullmq` queue (pass queue name;
  the lib registers the processor).
- `redis` — pub/sub or stream for a dedicated worker without BullMQ.

## Testing

`@dudousxd/nestjs-notifications-testing`: `NotificationFake` (records instead of delivering) +
assertions `assertSentTo`, `assertSentOnChannel`, `assertNothingSent`, `assertCount`, and
channel/dispatcher fakes for integration tests.
