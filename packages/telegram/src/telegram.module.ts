import { type DynamicModule, Module, type Provider } from '@nestjs/common';
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

    const providers: Provider[] = [
      { provide: TELEGRAM_OPTIONS, useValue: telegramOptions },
      TelegramChannel,
    ];

    return {
      module: TelegramChannelModule,
      global: options.global ?? true,
      providers,
      exports: [TelegramChannel],
    };
  }
}
