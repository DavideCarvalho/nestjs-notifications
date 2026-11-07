import { randomBytes } from 'node:crypto';
import {
  type Notification,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import { OutboxModule } from '@nestjs/outbox';
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
import { Webhook, WebhookChannel, type WebhookChannelOptions } from './webhook.channel';
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
});
