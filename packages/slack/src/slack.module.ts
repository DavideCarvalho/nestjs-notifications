import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
  type OptionalFactoryDependency,
} from '@nestjs/common';
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

/** Options for {@link SlackChannelModule.forRootAsync}. */
export interface SlackChannelModuleAsyncOptions {
  /** Modules exporting the providers `inject` needs. */
  imports?: ModuleMetadata['imports'];
  /** Providers passed (in order) to `useFactory`. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /**
   * Build the module options — typically to hand `resolveOptions` a DI-provided service (e.g. a
   * repository that loads each tenant's Slack installation).
   */
  useFactory: (
    ...args: any[]
  ) =>
    | Omit<SlackChannelModuleOptions, 'global'>
    | Promise<Omit<SlackChannelModuleOptions, 'global'>>;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/** Internal token for the factory-built module options of {@link SlackChannelModule.forRootAsync}. */
const SLACK_MODULE_OPTIONS = Symbol('SLACK_MODULE_OPTIONS');

/** Narrow module options to the channel's {@link SlackChannelOptions} (exactOptionalPropertyTypes). */
function toChannelOptions(options: SlackChannelModuleOptions): SlackChannelOptions {
  return {
    ...(options.webhookUrl !== undefined ? { webhookUrl: options.webhookUrl } : {}),
    ...(options.token !== undefined ? { token: options.token } : {}),
    ...(options.defaultChannel !== undefined ? { defaultChannel: options.defaultChannel } : {}),
  };
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
    // Set each field only when provided (exactOptionalPropertyTypes); the channel resolves
    // per-notifiable routing / defaults when these are absent.
    const slackOptions = toChannelOptions(options);

    return defineChannelModule({
      module: SlackChannelModule,
      channel: SlackChannel,
      optionsToken: SLACK_OPTIONS,
      options: slackOptions,
      resolver: { token: SLACK_OPTIONS_RESOLVER, value: options.resolveOptions },
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }

  /**
   * Like {@link forRoot}, but the options come from a factory with injected dependencies — so an
   * (async) `resolveOptions` can use your services:
   *
   * ```ts
   * SlackChannelModule.forRootAsync({
   *   imports: [SlackInstallsModule],
   *   inject: [SlackInstallsService],
   *   useFactory: (installs: SlackInstallsService) => ({
   *     resolveOptions: async (tenant) => {
   *       const install = await installs.forTenant(tenant);
   *       return { token: install.botToken, defaultChannel: install.channelId };
   *     },
   *   }),
   * });
   * ```
   */
  static forRootAsync(options: SlackChannelModuleAsyncOptions): DynamicModule {
    return {
      module: SlackChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: SLACK_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: SLACK_OPTIONS,
          useFactory: (resolved: SlackChannelModuleOptions) => toChannelOptions(resolved),
          inject: [SLACK_MODULE_OPTIONS],
        },
        {
          provide: SLACK_OPTIONS_RESOLVER,
          useFactory: (resolved: SlackChannelModuleOptions) => resolved.resolveOptions ?? null,
          inject: [SLACK_MODULE_OPTIONS],
        },
        SlackChannel,
      ],
      exports: [SlackChannel],
    };
  }
}
