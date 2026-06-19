import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { DiscordChannel, type DiscordChannelOptions } from './discord.channel';
import { DISCORD_OPTIONS } from './tokens';

export interface DiscordChannelModuleOptions {
  /** Default incoming-webhook URL. */
  webhookUrl?: string;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the discord channel.
 *
 * ```ts
 * DiscordChannelModule.forRoot({ webhookUrl: 'https://discord.com/api/webhooks/...' });
 * ```
 */
@Module({})
export class DiscordChannelModule {
  static forRoot(options: DiscordChannelModuleOptions = {}): DynamicModule {
    const discordOptions: DiscordChannelOptions = {
      // Set `webhookUrl` only when provided (exactOptionalPropertyTypes); the channel falls back
      // to a per-notifiable route when it is absent.
      ...(options.webhookUrl !== undefined ? { webhookUrl: options.webhookUrl } : {}),
    };

    return defineChannelModule({
      module: DiscordChannelModule,
      channel: DiscordChannel,
      optionsToken: DISCORD_OPTIONS,
      options: discordOptions,
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }
}
