import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackMessage } from './slack-message';
import { SlackChannel } from './slack.channel';
import type { SlackNotification } from './slack.channel';

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXX';

/** A fetch Response stand-in for Slack's Web API (HTTP 200 + JSON body). */
const apiResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

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

  it('uses the per-tenant options (token) when a tenant is in the delivery context', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse({ ok: true, channel: 'C1', ts: '1.2' }));
    vi.stubGlobal('fetch', fetchMock);

    const resolveOptions = vi
      .fn()
      .mockReturnValue({ token: 'xoxb-tenant', defaultChannel: '#ops' });
    const channel = new SlackChannel({ webhookUrl: WEBHOOK }, resolveOptions);

    await channel.send(new TestUser('#general'), new DeployFinished(), { tenant: 'acme' });

    expect(resolveOptions).toHaveBeenCalledWith('acme');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(init.headers.Authorization).toBe('Bearer xoxb-tenant');
    const body = JSON.parse(init.body as string);
    expect(body.channel).toBe('#general');
  });

  it('uses the default options when no tenant is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const resolveOptions = vi.fn().mockReturnValue({ token: 'xoxb-tenant' });
    const channel = new SlackChannel({ webhookUrl: WEBHOOK }, resolveOptions);

    await channel.send(new TestUser(WEBHOOK), new DeployFinished());

    expect(resolveOptions).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    await expect(channel.send(new TestUser(WEBHOOK), new DeployFinished())).rejects.toThrow(
      /failed with status 500/,
    );
  });

  it('returns { webhook: true } for webhook deliveries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    await expect(channel.send(new TestUser(WEBHOOK), new DeployFinished())).resolves.toEqual({
      webhook: true,
    });
  });

  it('returns the posted message { channel, ts } from chat.postMessage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse({ ok: true, channel: 'C024BE91L', ts: '1503435956.000247' }));
    vi.stubGlobal('fetch', fetchMock);

    const channel = new SlackChannel({ token: 'xoxb-1', defaultChannel: '#general' });
    const result = await channel.send(new TestUser(undefined), new DeployFinished());

    expect(result).toEqual({ channel: 'C024BE91L', ts: '1503435956.000247' });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string).channel).toBe('#general');
  });

  it('throws a descriptive error when the Web API answers 200 with { ok: false }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(apiResponse({ ok: false, error: 'channel_not_found' })),
    );
    const channel = new SlackChannel({ token: 'xoxb-1' });

    await expect(channel.send(new TestUser('C404'), new DeployFinished())).rejects.toThrow(
      'Slack chat.postMessage to channel "C404" failed: channel_not_found.',
    );
  });

  it('throws when the Web API response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );
    const channel = new SlackChannel({ token: 'xoxb-1' });
    await expect(channel.send(new TestUser('C1'), new DeployFinished())).rejects.toThrow(
      /non-JSON/,
    );
  });

  it('awaits an async per-tenant resolver', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(apiResponse({ ok: true, channel: 'C9', ts: '9.9' }));
    vi.stubGlobal('fetch', fetchMock);

    const resolveOptions = vi.fn(async (tenant: string) => ({
      token: `xoxb-${tenant}`,
      defaultChannel: 'C9',
    }));
    const channel = new SlackChannel({ webhookUrl: WEBHOOK }, resolveOptions);

    const result = await channel.send(new TestUser(undefined), new DeployFinished(), {
      tenant: 'acme',
    });

    expect(resolveOptions).toHaveBeenCalledWith('acme');
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer xoxb-acme');
    expect(result).toEqual({ channel: 'C9', ts: '9.9' });
  });

  it('throws MissingChannelMethodError when toSlack is absent', async () => {
    const channel = new SlackChannel({ webhookUrl: WEBHOOK });
    const bare: Notification = { via: () => ['slack'] };

    await expect(channel.send(new TestUser(WEBHOOK), bare)).rejects.toThrow(/toSlack\(\)/);
  });
});
