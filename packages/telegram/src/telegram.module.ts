import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { TelegramChannel, type TelegramChannelOptions } from './telegram.channel';
import { TELEGRAM_OPTIONS } from './tokens';

export interface TelegramChannelModuleOptions {
  /** Bot token for the Telegram Bot API. */
  botToken?: string;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the telegram channel.
 *
 * ```ts
 * TelegramChannelModule.forRoot({ botToken: process.env.TELEGRAM_BOT_TOKEN });
 * ```
 */
@Module({})
export class TelegramChannelModule {
  static forRoot(options: TelegramChannelModuleOptions = {}): DynamicModule {
    const telegramOptions: TelegramChannelOptions = {
      // Set `botToken` only when provided (exactOptionalPropertyTypes); the channel raises a clear
      // error at send time when it is absent.
      ...(options.botToken !== undefined ? { botToken: options.botToken } : {}),
    };

    return defineChannelModule({
      module: TelegramChannelModule,
      channel: TelegramChannel,
      optionsToken: TELEGRAM_OPTIONS,
      options: telegramOptions,
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }
}
