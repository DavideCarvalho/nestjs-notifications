import { type DynamicModule, type Provider, type Type } from '@nestjs/common';

/**
 * Config for {@link defineChannelModule} — the shared shape of a simple delivery
 * channel's `forRoot()` (slack/discord/teams/telegram/webhook). Channels with
 * bespoke transport/renderer wiring (mail/sms/push) build their DynamicModule
 * directly, since their providers don't fit this skeleton.
 */
export interface ChannelModuleConfig {
  /** The channel module class — becomes the DynamicModule's `module`. */
  module: Type<unknown>;
  /** The channel provider; registered and exported. */
  channel: Type<unknown>;
  /** DI token the channel reads its resolved options from. */
  optionsToken: symbol | string;
  /** The channel options value (already narrowed to the fields that were provided). */
  options: object;
  /**
   * Optional per-tenant/per-notifiable options resolver. When present its token is
   * registered with the given value, defaulting to `null` when the value is absent.
   */
  resolver?: { token: symbol | string; value: unknown };
  /** Register globally so the channel is discoverable app-wide. Default `true`. */
  global?: boolean;
}

/**
 * Build the DynamicModule for a simple delivery channel: an options provider, an
 * optional resolver provider (defaulting to `null`), then the channel itself —
 * registered globally by default and exported. Single-sources the skeleton every
 * simple channel `forRoot()` repeated; channel-specific option shaping stays in
 * the channel module.
 */
export function defineChannelModule(config: ChannelModuleConfig): DynamicModule {
  const providers: Provider[] = [{ provide: config.optionsToken, useValue: config.options }];
  if (config.resolver) {
    providers.push({ provide: config.resolver.token, useValue: config.resolver.value ?? null });
  }
  providers.push(config.channel);

  return {
    module: config.module,
    global: config.global ?? true,
    providers,
    exports: [config.channel],
  };
}
