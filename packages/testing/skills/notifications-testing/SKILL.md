---
name: notifications-testing
description: >-
  Test NestJS notifications with @dudousxd/nestjs-notifications-testing. Use when asserting that
  notifications were (or were not) sent without delivering them: swap the real NotificationService
  for NotificationFake via provideNotificationFake() or .overrideProvider(NotificationService).useClass,
  record sends with send/notify/sendNow/sendAsync/route/forTenant/only/except, and assert with the
  Laravel-style API assertSent, assertSentTo, assertSentTimes, assertSentOnChannel, assertCount,
  assertNothingSent, plus sent()/records inspection and reset(). Also RecordingChannel for integration tests.
license: MIT
metadata:
  type: core
  library: "@dudousxd/nestjs-notifications-testing"
  library_version: 0.6.0
  framework: nestjs
---

# nestjs-notifications — testing

`NotificationFake` is a drop-in replacement for `NotificationService` that records every send
instead of delivering it, and exposes Laravel-style assertions. No transports, no channels, no
queues run.

## Setup

```bash
pnpm add -D @dudousxd/nestjs-notifications-testing
```

Standalone (no Nest container):

```ts
import { NotificationFake } from '@dudousxd/nestjs-notifications-testing';

const fake = new NotificationFake();
await fake.send(user, new InvoicePaid('inv_1', 42));
fake.assertSentTo(user, InvoicePaid);
fake.assertSentOnChannel('mail');
```

Inside a Nest test module — swap the real service so the code under test injects the fake:

```ts
import { NotificationService } from '@dudousxd/nestjs-notifications-core';
import { provideNotificationFake, NotificationFake } from '@dudousxd/nestjs-notifications-testing';
import { Test } from '@nestjs/testing';

const moduleRef = await Test.createTestingModule({
  providers: [BillingService, provideNotificationFake()],
}).compile();

const fake = moduleRef.get(NotificationService) as unknown as NotificationFake;
await moduleRef.get(BillingService).paid(user, 'inv_1', 42);
fake.assertSent(InvoicePaid);
```

## Core patterns

### 1. Record then assert

The fake implements the full `NotificationService` surface (`send`, `notify`, `sendNow`,
`sendAsync`, `route`, `forTenant`/`forTenants`, `only`/`except`). Channels are resolved exactly like
production (decorator inference or `via()`), so channel assertions are meaningful.

```ts
const fake = new NotificationFake();
await fake.send(user, new InvoicePaid('inv_1', 42));

fake.assertCount(1);
fake.assertSent(InvoicePaid);                          // at least one
fake.assertSentTimes(InvoicePaid, 1);                  // exactly N
fake.assertSentTo(user, InvoicePaid);                  // to a specific notifiable (by ref)
fake.assertSentOnChannel('mail', InvoicePaid);         // on a channel
```

### 2. Assert with a predicate / inspect records

```ts
fake.assertSent(InvoicePaid, (record) => {
  return (record.notification as InvoicePaid).invoiceId === 'inv_1' && record.channels.includes('mail');
});

// Or read the raw SentNotificationRecord[] for custom expectations
const records = fake.sent(InvoicePaid); // { notifiable, notification, channels, mode, tenant }
expect(records[0].mode).toBe('sync');   // 'async' when shouldQueue/delay set
```

`assertSentTo` also accepts a predicate over the notifiable:
`fake.assertSentTo((n) => (n as User).id === 1, InvoicePaid)`.

### 3. Negative + lifecycle assertions

```ts
fake.assertNothingSent();   // throws if any record exists
fake.reset();               // clear records between cases
```

Scoping is recorded too: `await fake.forTenant('acme').send(user, n)` stores `tenant: 'acme'`, and
`fake.only(['mail']).send(...)` / `except(['sms'])` filter the recorded channels.

## Common mistakes

### Asserting on a real transport instead of the fake

```ts
// Wrong — uses the real NotificationService + a live MailChannel, then reaches into the transport
const result = await realService.send(user, n);
expect(sentEmails).toContain(/* ... */); // brittle, couples the test to mail internals

// Correct — record sends with the fake and assert intent
const fake = new NotificationFake();
await fake.send(user, n);
fake.assertSentOnChannel('mail');
```

The fake asserts *that a notification was sent on a channel*, decoupled from any transport. Source:
packages/testing/src/notification-fake.ts.

### Not swapping the provider, so the SUT keeps the real service

```ts
// Wrong — fake created on the side, but BillingService still injects the real NotificationService
const fake = new NotificationFake();
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
// fake.records stays empty

// Correct — override the token the SUT injects
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(NotificationService).useClass(NotificationFake)
  .compile();
const fake = moduleRef.get(NotificationService) as unknown as NotificationFake;
```

Assertions only see sends made through the injected service; the fake must replace the
`NotificationService` token. Source: packages/testing/src/provide-notification-fake.ts.

### Reusing one fake across cases without resetting

```ts
// Wrong — records leak between tests -> assertCount/assertNothingSent flake
const fake = new NotificationFake();
it('a', async () => { await fake.send(user, n); fake.assertCount(1); });
it('b', () => { fake.assertNothingSent(); }); // fails: record from 'a' remains

// Correct — clear between cases
afterEach(() => fake.reset());
```

`records` accumulates for the life of the instance; `reset()` empties it. Source:
packages/testing/src/notification-fake.ts (`reset`).
