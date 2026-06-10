import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebhookMessage } from './webhook-message';
import { WebhookChannel } from './webhook.channel';
import type { WebhookNotification } from './webhook.channel';

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
});
