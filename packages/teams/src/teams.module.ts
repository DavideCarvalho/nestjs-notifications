import { type DynamicModule, Module, type Provider } from '@nestjs/common';
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

    const providers: Provider[] = [
      { provide: TEAMS_OPTIONS, useValue: teamsOptions },
      TeamsChannel,
    ];

    return {
      module: TeamsChannelModule,
      global: options.global ?? true,
      providers,
      exports: [TeamsChannel],
    };
  }
}
