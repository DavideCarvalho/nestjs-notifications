import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Notifiable } from '@dudousxd/nestjs-notifications-core';
import { describe, expect, it, vi } from 'vitest';

// Simulate an app that installed NONE of the optional peer SDKs: resolving any of them fails the
// way Node does for a missing package.
const { missing } = vi.hoisted(() => ({
  missing: (name: string) => () => {
    const error = new Error(`Cannot find module '${name}'`) as Error & { code: string };
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  },
}));
vi.mock('web-push', missing('web-push'));
vi.mock('firebase-admin', missing('firebase-admin'));
vi.mock('expo-server-sdk', missing('expo-server-sdk'));
vi.mock('@parse/node-apn', missing('@parse/node-apn'));

const OPTIONAL_PEERS = ['web-push', 'firebase-admin', 'expo-server-sdk', '@parse/node-apn'];

describe('optional peer SDKs', () => {
  it('the package root imports and PushChannel works with a custom transport, no SDK installed', async () => {
    const pkg = await import('./index');
    expect(typeof pkg.PushChannel).toBe('function');
    expect(typeof pkg.WebPushTransport).toBe('function');

    const send = vi.fn().mockResolvedValue(undefined);
    const channel = new pkg.PushChannel({ send });
    const user: Notifiable = { routeNotificationFor: () => 'sub-1' };
    const notification = {
      via: () => ['push'],
      toPush: () => new pkg.PushMessage().title('Hi'),
    };

    await expect(channel.send(user, notification)).resolves.toMatchObject({ delivered: 1 });
    expect(send).toHaveBeenCalledOnce();
  });

  it('a built-in transport constructs fine and fails on first send with an install hint', async () => {
    const { WebPushTransport, FcmTransport, ExpoTransport, ApnsTransport, PushMessage } =
      await import('./index');
    const message = new PushMessage().title('Hi');

    await expect(
      new WebPushTransport({ publicKey: 'p', privateKey: 'k', subject: 'mailto:a@b.c' }).send(
        {},
        message,
      ),
    ).rejects.toThrow(/WebPushTransport needs the optional peer dependency "web-push"/);
    await expect(new FcmTransport({}).send('t', message)).rejects.toThrow(/"firebase-admin"/);
    await expect(new ExpoTransport({}).send('t', message)).rejects.toThrow(/"expo-server-sdk"/);
    await expect(new ApnsTransport({}).send('t', message)).rejects.toThrow(/"@parse\/node-apn"/);
  });

  it('no source file value-imports an optional peer at the top level', () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      for (const peer of OPTIONAL_PEERS) {
        const staticValueImport = new RegExp(
          `^import\\s+(?!type\\b)[^;]*from\\s+['"]${peer.replace('/', '\\/')}['"]`,
          'm',
        );
        if (staticValueImport.test(source)) offenders.push(`${file} → ${peer}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
