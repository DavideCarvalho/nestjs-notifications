import { createHmac } from 'node:crypto';
import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEBHOOK_OPTIONS } from './tokens';
import { WebhookMessage } from './webhook-message';
import { WebhookChannel } from './webhook.channel';
import type { WebhookNotification } from './webhook.channel';
import { WebhookChannelModule } from './webhook.module';

const URL = 'https://example.com/hooks/notifications';

class TestUser implements Notifiable {
  constructor(private route: unknown) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class OrderPaidMessage implements WebhookNotification {
  via(): string[] {
    return ['webhook'];
  }
  toWebhook(): WebhookMessage {
    return new WebhookMessage()
      .url(URL)
      .header('X-Signature', 'abc123')
      .payload({ event: 'order.paid', id: 42 });
  }
}

class OrderPaidPlain implements WebhookNotification {
  via(): string[] {
    return ['webhook'];
  }
  toWebhook(): Record<string, unknown> {
    return { event: 'order.paid', id: 7 };
  }
}

describe('WebhookChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the WebhookMessage payload to its url with merged headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new WebhookChannel({ headers: { 'X-App': 'flip' } });
    await channel.send(new TestUser(undefined), new OrderPaidMessage());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-App']).toBe('flip');
    expect(init.headers['X-Signature']).toBe('abc123');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ event: 'order.paid', id: 42 });
  });

  it('treats a plain object return as the JSON body and uses the route url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new WebhookChannel({});
    await channel.send(new TestUser(URL), new OrderPaidPlain());

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(URL);
    expect(JSON.parse(init.body as string)).toEqual({ event: 'order.paid', id: 7 });
  });

  it('falls back to the configured url when neither message nor route supplies one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new WebhookChannel({ url: URL });
    await channel.send(new TestUser(undefined), new OrderPaidPlain());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(URL);
  });

  it('uses the per-tenant options (url and headers) when a tenant is in the context', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const tenantUrl = 'https://acme.example.com/hooks';
    const resolveOptions = vi
      .fn()
      .mockReturnValue({ url: tenantUrl, headers: { 'X-Tenant': 'acme' } });
    const channel = new WebhookChannel({ url: URL }, resolveOptions);

    await channel.send(new TestUser(undefined), new OrderPaidPlain(), { tenant: 'acme' });

    expect(resolveOptions).toHaveBeenCalledWith('acme');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(tenantUrl);
    expect(init.headers['X-Tenant']).toBe('acme');
  });

  it('uses the per-tenant options (url and headers) when a tenant is in the context (async resolver)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const tenantUrl = 'https://acme.example.com/hooks';
    const resolveOptions = vi
      .fn()
      .mockResolvedValue({ url: tenantUrl, headers: { 'X-Tenant': 'acme' } });
    const channel = new WebhookChannel({ url: URL }, resolveOptions);

    await channel.send(new TestUser(undefined), new OrderPaidPlain(), { tenant: 'acme' });

    expect(resolveOptions).toHaveBeenCalledWith('acme');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(tenantUrl);
    expect(init.headers['X-Tenant']).toBe('acme');
  });

  it('uses the default options when no tenant is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const resolveOptions = vi.fn().mockReturnValue({ url: 'https://acme.example.com/hooks' });
    const channel = new WebhookChannel({ url: URL }, resolveOptions);

    await channel.send(new TestUser(undefined), new OrderPaidPlain());

    expect(resolveOptions).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(URL);
  });

  it('throws a clear error when no target url can be resolved', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const channel = new WebhookChannel({});
    await expect(channel.send(new TestUser(undefined), new OrderPaidPlain())).rejects.toThrow(
      /needs a target URL/,
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const channel = new WebhookChannel({ url: URL });
    await expect(channel.send(new TestUser(undefined), new OrderPaidPlain())).rejects.toThrow(
      /failed with status 503/,
    );
  });

  it('throws MissingChannelMethodError when toWebhook is absent', async () => {
    const channel = new WebhookChannel({ url: URL });
    const bare: Notification = { via: () => ['webhook'] };

    await expect(channel.send(new TestUser(URL), bare)).rejects.toThrow(/toWebhook\(\)/);
  });

  it('forRoot() forwards secret / signatureHeader / timeoutMs / redirect to the channel options', () => {
    const module = WebhookChannelModule.forRoot({
      url: URL,
      secret: 's3cret',
      signatureHeader: 'X-Hub-Signature-256',
      timeoutMs: 15_000,
      redirect: 'error',
    });
    const provider = (module.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === WEBHOOK_OPTIONS,
    ) as { useValue: unknown } | undefined;
    expect(provider?.useValue).toEqual({
      url: URL,
      secret: 's3cret',
      signatureHeader: 'X-Hub-Signature-256',
      timeoutMs: 15_000,
      redirect: 'error',
    });
  });

  it('signs with the configured secret through forRoot options (documented usage)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new WebhookChannel({ url: URL, secret: 's3cret' });
    await channel.send(new TestUser(undefined), new OrderPaidPlain());

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const expected = createHmac('sha256', 's3cret')
      .update(init.body as string)
      .digest('hex');
    expect(init.headers['X-Signature-256']).toBe(`sha256=${expected}`);
  });

  it('passes a timeout signal and the redirect mode to fetch when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new WebhookChannel({ url: URL, timeoutMs: 1_000, redirect: 'error' });
    await channel.send(new TestUser(undefined), new OrderPaidPlain());

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe('error');
  });

  it('leaves fetch defaults untouched when no timeout / redirect is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new WebhookChannel({ url: URL }).send(new TestUser(undefined), new OrderPaidPlain());

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).not.toHaveProperty('signal');
    expect(init).not.toHaveProperty('redirect');
  });
});
