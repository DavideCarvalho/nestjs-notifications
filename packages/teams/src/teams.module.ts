import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { TeamsChannel, type TeamsChannelOptions } from './teams.channel';
import { TEAMS_OPTIONS } from './tokens';

export interface TeamsChannelModuleOptions {
  /** Default incoming-webhook URL. */
  webhookUrl?: string;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the teams channel.
 *
 * ```ts
 * TeamsChannelModule.forRoot({ webhookUrl: 'https://outlook.office.com/webhook/...' });
 * ```
 */
@Module({})
export class TeamsChannelModule {
  static forRoot(options: TeamsChannelModuleOptions = {}): DynamicModule {
    const teamsOptions: TeamsChannelOptions = {
      // Set `webhookUrl` only when provided (exactOptionalPropertyTypes); the channel falls back
      // to a per-notifiable route when it is absent.
      ...(options.webhookUrl !== undefined ? { webhookUrl: options.webhookUrl } : {}),
    };

    return defineChannelModule({
      module: TeamsChannelModule,
      channel: TeamsChannel,
      optionsToken: TEAMS_OPTIONS,
      options: teamsOptions,
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }
}
