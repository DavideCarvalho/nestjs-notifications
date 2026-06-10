import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackMessage } from './slack-message';
import { SlackChannel } from './slack.channel';
import type { SlackNotification } from './slack.channel';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXX';

class TestUser implements Notifiable {
  constructor(private route: unknown) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class DeployFinished implements SlackNotification {
  via(): string[] {
    return ['slack'];
  }
  toSlack(): SlackMessage {
    return new SlackMessage()
      .text('Deploy finished')
      .block({ type: 'section', text: { type: 'mrkdwn', text: '*Done!*' } });
  }
}

describe('SlackChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the payload to the webhook url returned by the route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new SlackChannel({});
    await channel.send(new TestUser(WEBHOOK), new DeployFinished());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe('Deploy finished');
    expect(body.blocks).toHaveLength(1);
  });

  it('falls back to the configured webhookUrl when the route is a channel id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    await channel.send(new TestUser('#general'), new DeployFinished());

    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    await expect(channel.send(new TestUser(WEBHOOK), new DeployFinished())).rejects.toThrow(
      /failed with status 500/,
    );
  });

  it('throws MissingChannelMethodError when toSlack is absent', async () => {
    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    const bare: Notification = { via: () => ['slack'] };

    await expect(channel.send(new TestUser(WEBHOOK), bare)).rejects.toThrow(/toSlack\(\)/);
  });
});
