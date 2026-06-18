import { type DynamicModule, Module, type Provider } from '@nestjs/common';
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

    const providers: Provider[] = [
      { provide: DISCORD_OPTIONS, useValue: discordOptions },
      DiscordChannel,
    ];

    return {
      module: DiscordChannelModule,
      global: options.global ?? true,
      providers,
      exports: [DiscordChannel],
    };
  }
}
