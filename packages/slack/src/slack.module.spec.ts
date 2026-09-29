import 'reflect-metadata';
import {
  type Notifiable,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SlackMessage } from './slack-message';
import type { SlackDeliveryResult } from './slack.channel';
import { SlackChannelModule } from './slack.module';

class Workspace implements Notifiable {
  routeNotificationFor(): unknown {
    return 'C_ALERTS';
  }
}

class DeployFinished {
  readonly delivered: Array<{ channel: string; response: unknown }> = [];
  via(): string[] {
    return ['slack'];
  }
  toSlack(): SlackMessage {
    return new SlackMessage().text('Deploy finished');
  }
  afterSending(_notifiable: Notifiable, channel: string, response: unknown): void {
    this.delivered.push({ channel, response });
  }
}

describe('SlackChannelModule (Nest wiring)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('awaits an async per-tenant resolver and surfaces { channel, ts } in the SendResult + afterSending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, channel: 'C_ALERTS', ts: '1700000000.000100' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        NotificationsModule.forRoot({ global: true }),
        SlackChannelModule.forRoot({
          resolveOptions: async (tenant) => ({ token: `xoxb-${tenant}` }),
        }),
      ],
    }).compile();
    await moduleRef.init();

    const notification = new DeployFinished();
    const [result] = await moduleRef
      .get(NotificationService)
      .forTenant('acme')
      .sendNow(new Workspace(), notification);

    const expected: SlackDeliveryResult = { channel: 'C_ALERTS', ts: '1700000000.000100' };
    expect(result?.tenant).toBe('acme');
    expect(result?.results).toEqual([{ channel: 'slack', status: 'sent', response: expected }]);
    expect(notification.delivered).toEqual([{ channel: 'slack', response: expected }]);
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer xoxb-acme');
    await moduleRef.close();
  });

  it('forRootAsync() builds the (async) resolver from injected providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, channel: 'C_T', ts: '1.1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const INSTALLS = Symbol('INSTALLS');
    @Global()
    @Module({
      providers: [{ provide: INSTALLS, useValue: new Map([['acme', 'xoxb-from-db']]) }],
      exports: [INSTALLS],
    })
    class InstallsModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        NotificationsModule.forRoot({ global: true }),
        InstallsModule,
        SlackChannelModule.forRootAsync({
          inject: [INSTALLS],
          useFactory: async (installs: Map<string, string>) => ({
            defaultChannel: 'C_DEFAULT',
            resolveOptions: async (tenant: string) => ({
              token: installs.get(tenant) as string,
              defaultChannel: 'C_T',
            }),
          }),
        }),
      ],
    }).compile();
    await moduleRef.init();

    const [result] = await moduleRef
      .get(NotificationService)
      .forTenant('acme')
      .sendNow(new Workspace(), new DeployFinished());

    expect(result?.results[0]).toEqual({
      channel: 'slack',
      status: 'sent',
      response: { channel: 'C_T', ts: '1.1' },
    });
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer xoxb-from-db');
    await moduleRef.close();
  });
});
