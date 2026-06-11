import type { Notifiable, Notification } from '@dudousxd/nestjs-notifications-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramMessage } from './telegram-message';
import { TelegramChannel } from './telegram.channel';
import type { TelegramNotification } from './telegram.channel';

const TOKEN = '123456:ABC-DEF';
const CHAT_ID = '987654321';

class TestUser implements Notifiable {
  constructor(private route: unknown) {}
  routeNotificationFor(): unknown {
    return this.route;
  }
}

class DeployFinished implements TelegramNotification {
  via(): string[] {
    return ['telegram'];
  }
  toTelegram(): TelegramMessage {
    return new TelegramMessage().text('*Deploy finished*').parseMode('MarkdownV2');
  }
}

class PlainMessage implements TelegramNotification {
  via(): string[] {
    return ['telegram'];
  }
  toTelegram(): string {
    return 'just text';
  }
}

describe('TelegramChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the Bot API sendMessage endpoint with chat_id and parse_mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TelegramChannel({ botToken: TOKEN });
    await channel.send(new TestUser(CHAT_ID), new DeployFinished());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe(CHAT_ID);
    expect(body.text).toBe('*Deploy finished*');
    expect(body.parse_mode).toBe('MarkdownV2');
  });

  it('accepts a plain string shorthand from toTelegram', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const channel = new TelegramChannel({ botToken: TOKEN });
    await channel.send(new TestUser(CHAT_ID), new PlainMessage());

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body as string);
    expect(body.text).toBe('just text');
    expect(body.parse_mode).toBeUndefined();
  });

  it('throws when botToken is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const channel = new TelegramChannel({});
    await expect(channel.send(new TestUser(CHAT_ID), new DeployFinished())).rejects.toThrow(
      /needs a botToken/,
    );
  });

  it('throws when the chat id is missing', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const channel = new TelegramChannel({ botToken: TOKEN });
    await expect(channel.send(new TestUser(undefined), new DeployFinished())).rejects.toThrow(
      /needs a chat id/,
    );
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const channel = new TelegramChannel({ botToken: TOKEN });
    await expect(channel.send(new TestUser(CHAT_ID), new DeployFinished())).rejects.toThrow(
      /failed with status 500/,
    );
  });

  it('throws MissingChannelMethodError when toTelegram is absent', async () => {
    const channel = new TelegramChannel({ botToken: TOKEN });
    const bare: Notification = { via: () => ['telegram'] };

    await expect(channel.send(new TestUser(CHAT_ID), bare)).rejects.toThrow(/toTelegram\(\)/);
  });
});
