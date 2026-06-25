---
name: notifications-async-dispatch
description: >-
  Queue NestJS notifications for async delivery with @dudousxd/nestjs-notifications-core.
  Use when a notification sets shouldQueue or delay, when choosing a dispatch driver
  (EventEmitterDispatcher in-process, bullmqDispatcher() for BullMQ, redis), and when satisfying
  the cross-process serialization contract: the notifications:[...] rehydration registry,
  resolveNotifiable(ref) to reload a Notifiable, toNotifiableRef()/@NotifiableId()/@Notifiable({type}),
  @Notification({name}) stable names, queue/delay options, queued status, and DispatchDriver.
  Covers NotificationSerializationError and worker rehydration failures.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-notifications-core"
  library_version: 0.8.1
  framework: nestjs
---

# nestjs-notifications — async dispatch

Channel drivers decide *how* a notification leaves (mail, slack…). Dispatch drivers decide
*where/when* it is processed: inline (default `SyncDispatcher`), in-process events, or a real queue.
They are orthogonal — you can send by mail (channel) asynchronously through BullMQ (dispatch).

## Setup

A notification goes async when it sets `shouldQueue` (or a `delay`), or when you call `sendAsync`.
Pick a dispatcher and register it on `NotificationsModule.forRoot`.

In-process (non-blocking, single process), via `@nestjs/event-emitter`:

```ts
import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import { EventEmitterDispatcher } from '@dudousxd/nestjs-notifications-event-emitter';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    NotificationsModule.forRoot({ dispatcher: EventEmitterDispatcher, notifications: [InvoicePaid] }),
  ],
})
export class AppModule {}
```

Cross-process (durable, separate worker), via BullMQ — spread the `bullmqDispatcher()` helper:

```ts
import { bullmqDispatcher } from '@dudousxd/nestjs-notifications-bullmq';

NotificationsModule.forRoot({
  ...bullmqDispatcher({ attempts: 5, backoff: { type: 'exponential', delay: 2000 } }),
  notifications: [InvoicePaid],                         // rehydration registry (worker side)
  resolveNotifiable: (ref) => userRepo.findOneBy({ id: Number(ref.id) }),
});
// Requires BullModule.forRoot(...) (the Redis connection) configured elsewhere in the app.
```

## Core patterns

### 1. Mark a notification to queue

```ts
import { Notification } from '@dudousxd/nestjs-notifications-core';
import { Mail, MailMessage } from '@dudousxd/nestjs-notifications-mail';

@Notification({ name: 'invoice.paid' }) // stable name survives a class rename across the wire
export class InvoicePaid {
  shouldQueue = true;            // route through the async dispatcher
  // delay = 60_000;             // or a number of ms / an absolute Date (also forces async)
  // queue = 'emails';           // optional driver/queue hint

  constructor(public readonly invoiceId: string) {}

  @Mail() toMail() { return new MailMessage().subject(`Invoice ${this.invoiceId}`); }
}
```

`send()` auto-detects async when `shouldQueue` or `delay` is set; the per-channel `status` comes
back as `queued`. Force it either way with `sendAsync()` / `sendNow()`.

### 2. Make the notifiable rehydratable

A cross-process worker rebuilds the notifiable from a `{ type, id }` reference. Provide it with the
decorators (no method needed) or implement `toNotifiableRef()`:

```ts
import { Notifiable, NotifiableId, RouteFor } from '@dudousxd/nestjs-notifications-core';

@Notifiable({ type: 'User' }) // morph type used in the ref; defaults to the class name
export class User {
  @NotifiableId() id: number;            // -> ref.id
  @RouteFor('mail') email: string;
  constructor(id: number, email: string) { this.id = id; this.email = email; }
}
```

`resolveNotifiable(ref)` (in `forRoot`) turns that ref back into a live object inside the worker.

### 3. The serialization contract

For cross-process dispatch the engine serializes the notification to `{ name, data }` (its own
enumerable properties, or a custom `serialize()`), and the notifiable to its `{ type, id }` ref.
On the worker it looks `name` up in `notifications: [...]`, rebuilds the instance, and calls
`resolveNotifiable` to reload the recipient. The in-process `EventEmitterDispatcher` passes live
objects through and needs none of this.

## Common mistakes

### Queuing across processes without the rehydration registry

```ts
// Wrong — shouldQueue + BullMQ but no `notifications` registry
NotificationsModule.forRoot({
  ...bullmqDispatcher(),
  resolveNotifiable: (ref) => userRepo.findOneBy({ id: Number(ref.id) }),
});

// Correct — register every queueable notification class so the worker can rebuild it by name
NotificationsModule.forRoot({
  ...bullmqDispatcher(),
  notifications: [InvoicePaid, Welcome],
  resolveNotifiable: (ref) => userRepo.findOneBy({ id: Number(ref.id) }),
});
```

The worker only has the serialized `name`; without the class in `notifications` it cannot rehydrate
the instance. Source: packages/core/src/options.ts (`notifications`), packages/core/src/serializer.ts.

### Queuing a notifiable that has no async reference

```ts
// Wrong — no @NotifiableId() / toNotifiableRef(); the ref cannot be built
class User { constructor(public id: number, public email: string) {} }
// -> Error: Cannot build a notifiable reference. Implement toNotifiableRef(), or mark the id with @NotifiableId().

// Correct
@Notifiable()
class User { @NotifiableId() id!: number; @RouteFor('mail') email!: string; }
```

Async dispatch must persist *who* to reload; a notifiable with no id reference throws when the ref
is built. Source: packages/core/src/decorators.ts (`notifiableRef`), packages/core/src/interfaces.ts.

### Forgetting `resolveNotifiable` for a cross-process driver

```ts
// Wrong — BullMQ worker has a ref but no way to reload the recipient
NotificationsModule.forRoot({ ...bullmqDispatcher(), notifications: [InvoicePaid] });

// Correct
NotificationsModule.forRoot({
  ...bullmqDispatcher(),
  notifications: [InvoicePaid],
  resolveNotifiable: (ref) => userRepo.findOneBy({ id: Number(ref.id) }),
});
```

`resolveNotifiable` is required whenever a notification is processed out of process; without it the
worker cannot turn `{ type, id }` back into a `Notifiable`. Source: packages/core/src/options.ts
(`resolveNotifiable`), README "Async delivery".

### Assuming `EventEmitterDispatcher` survives a restart

```ts
// Wrong — relying on the in-process dispatcher for durable, retryable jobs
NotificationsModule.forRoot({ dispatcher: EventEmitterDispatcher });

// Correct — use a durable queue when delivery must survive a crash / scale to a worker
NotificationsModule.forRoot({ ...bullmqDispatcher({ attempts: 5 }), notifications: [...], resolveNotifiable });
```

`EventEmitterDispatcher` emits an in-memory event and delivers in the same process — fast and
non-blocking, but jobs are lost on restart and there are no retries. Source:
packages/event-emitter/src/event-emitter.dispatcher.ts, packages/bullmq/src/bullmq-dispatcher.helper.ts.
