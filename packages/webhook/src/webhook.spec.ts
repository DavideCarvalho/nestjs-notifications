import { randomBytes } from 'node:crypto';
import {
  type ChannelDriver,
  ChannelRegistry,
  type Notification,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import { outboxDispatcher } from '@dudousxd/nestjs-notifications-core/outbox';
import { InMemoryOutboxStore, OutboxModule, OutboxRelay, OutboxStorage } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import {
  InMemoryWebhookTransport,
  WebhookDestinationBlockedError,
  WebhookEndpoints,
  WebhookTransport,
  WebhookVerifier,
  WebhooksModule,
} from '@nestjs/webhooks';
import { describe, expect, it } from 'vitest';
import { sha256Signature } from './signing';
import { WebhookEvent, WebhookMessage } from './webhook-message';
import {
  WEBHOOK_DISPATCH_CONSUMER,
  Webhook,
  WebhookChannel,
  type WebhookChannelOptions,
  webhookId,
} from './webhook.channel';
import { WebhookChannelModule } from './webhook.module';

const URL = 'https://example.com/hooks/notifications';
const secret = `whsec_${randomBytes(32).toString('base64')}`;

class Customer {
  constructor(private readonly route?: string) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class OrderPaid {
  @Webhook()
  toWebhook() {
    return { event: 'order.paid', id: 7 };
  }
}

class OrderPaidMessage {
  @Webhook()
  toWebhook() {
    return new WebhookMessage()
      .url(URL)
      .header('X-App', 'shop')
      .payload({ event: 'order.paid', id: 42 });
  }
}

class InvoicePaid {
  constructor(readonly id: number) {}
  @Webhook()
  toWebhook() {
    return new WebhookEvent('invoice.paid', { id: this.id });
  }
}

function channel(
  options: WebhookChannelOptions,
  resolve?: (tenant: string) => WebhookChannelOptions,
) {
  return new WebhookChannel(options, resolve);
}

describe('WebhookChannel (direct URL)', () => {
  it('POSTs the WebhookMessage body to its url with merged headers', async () => {
    const transport = new InMemoryWebhookTransport();
    await channel({ transport, headers: { 'X-Tenant-App': 'flip' } }).send(
      new Customer(),
      new OrderPaidMessage() as Notification,
    );
    const sent = transport.single({ url: URL });
    expect(JSON.parse(sent.request.body)).toEqual({ event: 'order.paid', id: 42 });
    expect(sent.request.headers['x-app']).toBe('shop');
    expect(sent.request.headers['x-tenant-app']).toBe('flip');
    expect(sent.request.headers['content-type']).toBe('application/json');
  });

  it('uses the route url for a plain-object payload, then the configured default', async () => {
    const transport = new InMemoryWebhookTransport();
    await channel({ transport, url: 'https://default.example.com/h' }).send(
      new Customer(URL),
      new OrderPaid() as Notification,
    );
    await channel({ transport, url: 'https://default.example.com/h' }).send(
      new Customer(),
      new OrderPaid() as Notification,
    );
    expect(transport.filter().map((s) => s.request.url)).toEqual([
      URL,
      'https://default.example.com/h',
    ]);
  });

  it('uses the per-tenant options when a tenant is in the context', async () => {
    const transport = new InMemoryWebhookTransport();
    const tenantUrl = 'https://acme.example.com/hooks';
    await channel({ transport, url: URL }, () => ({ transport, url: tenantUrl })).send(
      new Customer(),
      new OrderPaid() as Notification,
      { tenant: 'acme' },
    );
    expect(transport.single().request.url).toBe(tenantUrl);
  });

  it('keeps the sha256= signature by default', async () => {
    const transport = new InMemoryWebhookTransport();
    await channel({ transport, url: URL, secret: 's3cret' }).send(
      new Customer(),
      new OrderPaid() as Notification,
    );
    const { headers, body } = transport.single().request;
    expect(headers['x-signature-256']).toBe(sha256Signature('s3cret', body));
  });

  it("signing: 'standard' is verified by a @nestjs/webhooks standard receiver", async () => {
    const transport = new InMemoryWebhookTransport();
    await channel({ transport, url: URL, secret, signing: 'standard' }).send(
      new Customer(),
      new OrderPaid() as Notification,
      {
        idempotencyKey: 'outbox-msg-1',
      },
    );
    const { headers, body } = transport.single().request;
    expect(headers['webhook-id']).toBe('outbox-msg-1');

    const moduleRef = await Test.createTestingModule({
      imports: [
        OutboxModule.forRoot({ relay: { enabled: false } }),
        WebhooksModule.forRoot({
          outgoing: false,
          receivers: { aviary: { scheme: 'standard', secret } },
        }),
      ],
    }).compile();
    const verified = moduleRef.get(WebhookVerifier).verify('aviary', { headers, rawBody: body });
    expect(verified.id).toBe('outbox-msg-1');
    expect(verified.payload).toEqual({ event: 'order.paid', id: 7 });
    expect(() =>
      moduleRef.get(WebhookVerifier).verify('aviary', { headers, rawBody: body.replace('7', '8') }),
    ).toThrow();
    await moduleRef.close();
  });

  it('fails on a non-2xx answer', async () => {
    const transport = new InMemoryWebhookTransport().respondWith(503);
    await expect(
      channel({ transport, url: URL }).send(new Customer(), new OrderPaid() as Notification),
    ).rejects.toThrow(/failed with status 503/);
  });

  it('sends through HttpWebhookTransport by default: private addresses and http are refused', async () => {
    await expect(
      channel({ url: 'https://127.0.0.1/hook' }).send(
        new Customer(),
        new OrderPaid() as Notification,
      ),
    ).rejects.toBeInstanceOf(WebhookDestinationBlockedError);
    await expect(
      channel({ url: 'http://example.com/hook' }).send(
        new Customer(),
        new OrderPaid() as Notification,
      ),
    ).rejects.toBeInstanceOf(WebhookDestinationBlockedError);
  });

  it('reuses one HttpWebhookTransport per tenant when the resolver returns fresh objects', async () => {
    const lookup = async () => [{ address: '10.0.0.1', family: 4 as const }];
    const ch = channel({ url: URL }, () => ({
      url: 'https://hooks.acme.test/h',
      delivery: { lookup, allowedAddresses: [] },
    }));
    const transports = (ch as unknown as { transports: Map<string, { transport: unknown }> })
      .transports;
    const send = (tenant: string) =>
      expect(
        ch.send(new Customer(), new OrderPaid() as Notification, { tenant }),
      ).rejects.toBeInstanceOf(WebhookDestinationBlockedError);

    await send('acme');
    const first = transports.get('acme')?.transport;
    expect(first).toBeDefined();
    await send('acme');
    expect(transports.get('acme')?.transport).toBe(first);
    await send('globex');
    expect(transports.size).toBe(2);
    expect(transports.get('globex')?.transport).not.toBe(first);
  });

  it('rebuilds a tenant transport when its delivery options change', async () => {
    let allowHttp = false;
    const ch = channel({ url: URL }, () => ({
      url: 'https://127.0.0.1/h',
      delivery: { allowHttp },
    }));
    const transports = (ch as unknown as { transports: Map<string, { transport: unknown }> })
      .transports;
    const send = () =>
      expect(
        ch.send(new Customer(), new OrderPaid() as Notification, { tenant: 'acme' }),
      ).rejects.toBeInstanceOf(WebhookDestinationBlockedError);
    await send();
    const first = transports.get('acme')?.transport;
    allowHttp = true;
    await send();
    expect(transports.get('acme')?.transport).not.toBe(first);
  });

  it('throws a clear error when no target url can be resolved', async () => {
    await expect(channel({}).send(new Customer(), new OrderPaid() as Notification)).rejects.toThrow(
      /needs a target URL/,
    );
  });

  it('throws MissingChannelMethodError when toWebhook is absent', async () => {
    await expect(channel({ url: URL }).send(new Customer(URL), {})).rejects.toThrow(
      /toWebhook\(\)/,
    );
  });
});

/** The in-memory store `OutboxModule` falls back to without a registered one. */
function outboxStore(moduleRef: { get(token: typeof OutboxStorage): OutboxStorage }) {
  return moduleRef.get(OutboxStorage).messages as InMemoryOutboxStore;
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('WebhookChannel (subscriptions via @nestjs/webhooks)', () => {
  it('dispatches a WebhookEvent to the endpoints of the delivery tenant', async () => {
    const transport = new InMemoryWebhookTransport();
    const moduleRef = await Test.createTestingModule({
      imports: [
        NotificationsModule.forRoot({ emitter: true }),
        OutboxModule.forRoot({ relay: { pollInterval: 10 } }),
        WebhooksModule.forRoot({ eventTypes: ['invoice.paid'], worker: { pollInterval: 10 } }),
        WebhookChannelModule.forRoot({ transaction: (work) => work({}) }),
      ],
    })
      .overrideProvider(WebhookTransport)
      .useValue(transport)
      .compile();
    await moduleRef.init();

    const endpoints = moduleRef.get(WebhookEndpoints);
    const acme = await endpoints.create({
      url: 'https://acme.example.com/hooks',
      eventTypes: ['invoice.paid'],
      tenant: 'acme',
    });
    await endpoints.create({
      url: 'https://other.example.com/hooks',
      eventTypes: ['invoice.paid'],
      tenant: 'other',
    });

    const [result] = await moduleRef
      .get(NotificationService)
      .forTenant('acme')
      .send(new Customer(), new InvoicePaid(9) as Notification);
    expect(result?.results[0]?.status).toBe('sent');

    await waitFor(() => transport.sent.length > 0);
    const sent = transport.single({ type: 'invoice.paid' });
    expect(sent.request.url).toBe(acme.url);
    expect(JSON.parse(sent.request.body).data).toEqual({ id: 9 });
    await moduleRef.close();
  });

  it('explains what is missing without WebhooksModule or a transaction runner', async () => {
    await expect(
      channel({}).send(new Customer(), new InvoicePaid(1) as Notification),
    ).rejects.toThrow(/WebhooksModule/);
  });

  it('a retried delivery (same idempotency key) dispatches the event once and succeeds', async () => {
    const transport = new InMemoryWebhookTransport();
    const moduleRef = await Test.createTestingModule({
      imports: [
        NotificationsModule.forRoot({ emitter: true }),
        // Relay run by hand, so the first message is still pending when the retry dispatches.
        OutboxModule.forRoot({ relay: { enabled: false } }),
        WebhooksModule.forRoot({ eventTypes: ['invoice.paid'], worker: { pollInterval: 10 } }),
        WebhookChannelModule.forRoot({
          transaction: (work) => outboxStore(moduleRef).transaction(work),
        }),
      ],
    })
      .overrideProvider(WebhookTransport)
      .useValue(transport)
      .compile();
    await moduleRef.init();
    const store = outboxStore(moduleRef);
    await moduleRef.get(WebhookEndpoints).create({
      url: 'https://acme.example.com/hooks',
      eventTypes: ['invoice.paid'],
    });
    const webhook = moduleRef.get(WebhookChannel);
    const send = () =>
      webhook.send(new Customer(), new InvoicePaid(5) as Notification, {
        idempotencyKey: 'outbox-msg-5',
      });

    const first = await send();
    expect(first).toMatchObject({ id: 'msg_outbox-msg-5', type: 'invoice.paid' });
    // While the first message is pending: no duplicate outbox id, no error.
    await expect(send()).resolves.toEqual({ id: 'msg_outbox-msg-5', duplicate: true });
    expect(store.stats(Date.now()).pending).toBe(1);
    expect(store.hasInbox(WEBHOOK_DISPATCH_CONSUMER, 'msg_outbox-msg-5')).toBe(true);

    await moduleRef.get(OutboxRelay).runOnce();
    await waitFor(() => transport.sent.length === 1);
    // After it was published and fanned out, a retry is still a no-op.
    await expect(send()).resolves.toEqual({ id: 'msg_outbox-msg-5', duplicate: true });
    await moduleRef.get(OutboxRelay).runOnce();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(transport.sent).toHaveLength(1);
    expect(transport.single().request.headers['webhook-id']).toBe('msg_outbox-msg-5');
    await moduleRef.close();
  });

  it('through the outbox dispatcher: a failFast retry caused by another channel delivers the webhook once', async () => {
    const transport = new InMemoryWebhookTransport();
    const flaky: ChannelDriver & { sends: number; failures: number } = {
      channel: 'flaky',
      sends: 0,
      failures: 1,
      async send() {
        this.sends++;
        if (this.failures-- > 0) throw new Error('flaky is down');
      },
    };
    class InvoiceSettled extends InvoicePaid {
      via() {
        return ['webhook', 'flaky'];
      }
    }
    const transaction = <T>(work: (tx: unknown) => Promise<T>) =>
      outboxStore(moduleRef).transaction(work);
    const moduleRef = await Test.createTestingModule({
      imports: [
        OutboxModule.forRoot({
          relay: { pollInterval: 10 },
          retry: { attempts: 5, backoff: { delay: 20, jitter: 'none' } },
        }),
        WebhooksModule.forRoot({ eventTypes: ['invoice.paid'], worker: { pollInterval: 10 } }),
        NotificationsModule.forRoot({
          emitter: true,
          errorPolicy: 'failFast',
          ...outboxDispatcher({ transaction }),
          notifications: [InvoiceSettled],
          resolveNotifiable: () => new Customer(),
        }),
        WebhookChannelModule.forRoot({ transaction }),
      ],
    })
      .overrideProvider(WebhookTransport)
      .useValue(transport)
      .compile();
    moduleRef.get(ChannelRegistry).register(flaky);
    await moduleRef.init();
    const store = outboxStore(moduleRef);
    await moduleRef.get(WebhookEndpoints).create({
      url: 'https://acme.example.com/hooks',
      eventTypes: ['invoice.paid'],
    });

    const customer = Object.assign(new Customer(), {
      toNotifiableRef: () => ({ type: 'Customer', id: 1 }),
    });
    await moduleRef.get(NotificationService).sendAsync(customer, new InvoiceSettled(6));
    await waitFor(() => flaky.sends === 2 && transport.sent.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(transport.sent).toHaveLength(1);
    expect(store.stats(Date.now()).pending).toBe(0);
    expect(store.listDeadLetters({})).toEqual([]);
    await moduleRef.close();
  });
});

describe('webhookId', () => {
  it('keeps a short, header-safe key readable', () => {
    expect(webhookId('outbox-msg-5')).toBe('msg_outbox-msg-5');
    expect(webhookId('0b6c7d3e-1f2a-4b5c-8d9e-0f1a2b3c4d5e')).toBe(
      'msg_0b6c7d3e-1f2a-4b5c-8d9e-0f1a2b3c4d5e',
    );
  });

  it('maps distinct keys to distinct ids (no `_` substitution, no truncation)', () => {
    const keys = ['a.b', 'a/b', 'a_b', 'a b', `${'x'.repeat(130)}1`, `${'x'.repeat(130)}2`];
    const ids = keys.map(webhookId);
    expect(new Set(ids).size).toBe(keys.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    }
  });

  it('hashes a key that is too long or unsafe, deterministically', () => {
    expect(webhookId('a.b')).toMatch(/^msgh_[0-9a-f]{64}$/);
    expect(webhookId('a.b')).toBe(webhookId('a.b'));
    expect(webhookId('x'.repeat(125))).toMatch(/^msgh_/);
    expect(webhookId('x'.repeat(124))).toBe(`msg_${'x'.repeat(124)}`);
  });
});
