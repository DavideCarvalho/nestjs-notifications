import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamsMessage } from './teams-message';
import { TeamsChannel } from './teams.channel';
import type { TeamsNotification } from './teams.channel';

const WEBHOOK = 'https://outlook.office.com/webhook/abc/IncomingWebhook/def';

class TestUser implements Notifiable {
  constructor(private route: unknown) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class DeployFinished implements TeamsNotification {
  via(): string[] {
    return ['teams'];
  }
  toTeams(): TeamsMessage {
    return new TeamsMessage().title('Deploy finished').text('Shipped to production');
  }
}

class CustomCard implements TeamsNotification {
  via(): string[] {
    return ['teams'];
  }
  toTeams(): Record<string, unknown> {
    return {
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive' }],
    };
  }
}

describe('TeamsChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a MessageCard payload to the webhook url returned by the route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TeamsChannel({});
    await channel.send(new TestUser(WEBHOOK), new DeployFinished());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body['@type']).toBe('MessageCard');
    expect(body.title).toBe('Deploy finished');
    expect(body.text).toBe('Shipped to production');
    expect(body.summary).toBe('Deploy finished');
  });

  it('posts a custom card object verbatim', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TeamsChannel({ webhookUrl: WEBHOOK });
    await channel.send(new TestUser(WEBHOOK), new CustomCard());

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
    expect(body.type).toBe('message');
    expect(body.attachments).toHaveLength(1);
  });

  it('falls back to the configured webhookUrl when the route is not a url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TeamsChannel({ webhookUrl: WEBHOOK });
    await channel.send(new TestUser('not-a-url'), new DeployFinished());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK);
  });

  it('throws when no webhook url is available', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const channel = new TeamsChannel({});
    await expect(channel.send(new TestUser(undefined), new DeployFinished())).rejects.toThrow(
      /needs a webhook URL/,
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const channel = new TeamsChannel({ webhookUrl: WEBHOOK });
    await expect(channel.send(new TestUser(WEBHOOK), new DeployFinished())).rejects.toThrow(
      /failed with status 500/,
    );
  });

  it('throws MissingChannelMethodError when toTeams is absent', async () => {
    const channel = new TeamsChannel({ webhookUrl: WEBHOOK });
    const bare: Notification = { via: () => ['teams'] };

    await expect(channel.send(new TestUser(WEBHOOK), bare)).rejects.toThrow(/toTeams\(\)/);
  });
});
