import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { SlackChannel, type SlackChannelOptions } from './slack.channel';
import { SLACK_OPTIONS } from './tokens';

export interface SlackChannelModuleOptions {
  /** Default incoming-webhook URL. */
  webhookUrl?: string;
  /** Bot/user token for the Web API. */
  token?: string;
  /** Default channel id for Web API delivery. */
  defaultChannel?: string;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the slack channel.
 *
 * ```ts
 * SlackChannelModule.forRoot({ webhookUrl: 'https://hooks.slack.com/services/...' });
 * // or, with the Web API:
 * SlackChannelModule.forRoot({ token: process.env.SLACK_BOT_TOKEN, defaultChannel: '#general' });
 * ```
 */
@Module({})
export class SlackChannelModule {
  static forRoot(options: SlackChannelModuleOptions = {}): DynamicModule {
    const slackOptions: SlackChannelOptions = {
      webhookUrl: options.webhookUrl,
      token: options.token,
      defaultChannel: options.defaultChannel,
    };

    const providers: Provider[] = [
      { provide: SLACK_OPTIONS, useValue: slackOptions },
      SlackChannel,
    ];

    return {
      module: SlackChannelModule,
      global: options.global ?? true,
      providers,
      exports: [SlackChannel],
    };
  }
}
