import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { SlackChannel, type SlackChannelOptions, type SlackOptionsResolver } from './slack.channel';
import { SLACK_OPTIONS, SLACK_OPTIONS_RESOLVER } from './tokens';

export interface SlackChannelModuleOptions {
  /** Default incoming-webhook URL. */
  webhookUrl?: string;
  /** Bot/user token for the Web API. */
  token?: string;
  /** Default channel id for Web API delivery. */
  defaultChannel?: string;
  /**
   * Optional per-tenant options resolver. When a notification is delivered with a
   * `context.tenant`, the returned options are used instead of the defaults.
   */
  resolveOptions?: SlackOptionsResolver;
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
      // Set each field only when provided (exactOptionalPropertyTypes); the channel resolves
      // per-notifiable routing / defaults when these are absent.
      ...(options.webhookUrl !== undefined ? { webhookUrl: options.webhookUrl } : {}),
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.defaultChannel !== undefined ? { defaultChannel: options.defaultChannel } : {}),
    };

    return defineChannelModule({
      module: SlackChannelModule,
      channel: SlackChannel,
      optionsToken: SLACK_OPTIONS,
      options: slackOptions,
      resolver: { token: SLACK_OPTIONS_RESOLVER, value: options.resolveOptions },
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }
}
