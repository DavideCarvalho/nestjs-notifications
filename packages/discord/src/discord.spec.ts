import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordMessage } from './discord-message';
import { DiscordChannel } from './discord.channel';
import type { DiscordNotification } from './discord.channel';

const WEBHOOK = 'https://discord.com/api/webhooks/123/abc';

class TestUser implements Notifiable {
  constructor(private route: unknown) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class DeployFinished implements DiscordNotification {
  via(): string[] {
    return ['discord'];
  }
  toDiscord(): DiscordMessage {
    return new DiscordMessage()
      .content('Deploy finished')
      .embed({ title: 'Done!', description: 'Shipped' });
  }
}

describe('DiscordChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the payload to the webhook url returned by the route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new DiscordChannel({});
    await channel.send(new TestUser(WEBHOOK), new DeployFinished());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.content).toBe('Deploy finished');
    expect(body.embeds).toHaveLength(1);
  });

  it('falls back to the configured webhookUrl when the route is not a url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new DiscordChannel({ webhookUrl: WEBHOOK });
    await channel.send(new TestUser('not-a-url'), new DeployFinished());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK);
  });

  it('throws when no webhook url is available', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const channel = new DiscordChannel({});
    await expect(channel.send(new TestUser(undefined), new DeployFinished())).rejects.toThrow(
      /needs a webhook URL/,
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const channel = new DiscordChannel({ webhookUrl: WEBHOOK });
    await expect(channel.send(new TestUser(WEBHOOK), new DeployFinished())).rejects.toThrow(
      /failed with status 500/,
    );
  });

  it('throws MissingChannelMethodError when toDiscord is absent', async () => {
    const channel = new DiscordChannel({ webhookUrl: WEBHOOK });
    const bare: Notification = { via: () => ['discord'] };

    await expect(channel.send(new TestUser(WEBHOOK), bare)).rejects.toThrow(/toDiscord\(\)/);
  });
});
