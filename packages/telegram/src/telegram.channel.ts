import {
  BaseChannel,
  type ChannelContext,
  type DeliveryContext,
  type Notifiable,
  type Notification,
  createChannel,
  postJson,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable } from '@nestjs/common';
import { TelegramMessage } from './telegram-message';
import { TELEGRAM_OPTIONS } from './tokens';

/** Channel handle: use as `@Telegram()` on a payload method, or as a token in `via()`. */
export const Telegram = createChannel('telegram');

/** Resolved runtime options for the telegram channel. */
export interface TelegramChannelOptions {
  /** Bot token used to build the Bot API URL (`https://api.telegram.org/bot<token>/...`). */
  botToken?: string;
}

/**
 * Implement this on a notification to define its Telegram payload. Returning a plain
 * string is treated as the message text; return a {@link TelegramMessage} for control
 * over the parse mode.
 */
export interface TelegramNotification extends Notification {
  toTelegram(ctx: ChannelContext): TelegramMessage | string;
}

/**
 * Delivers a notification to Telegram via the Bot API `sendMessage` method. The chat id
 * comes from `routeNotificationFor('telegram')`.
 */
@Injectable()
export class TelegramChannel extends BaseChannel {
  readonly channel = 'telegram';

  constructor(
    @Inject(TELEGRAM_OPTIONS)
    private readonly options: TelegramChannelOptions,
  ) {
    super();
  }

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<void> {
    const result = this.buildPayload<TelegramMessage | string>(
      notification,
      notifiable,
      'toTelegram',
      context,
    );
    const message = result instanceof TelegramMessage ? result : new TelegramMessage(result);
    const payload = message.toPayload();

    if (!this.options.botToken) {
      throw new Error('The telegram channel needs a botToken. Set it in forRoot().');
    }

    const route = routeFor(notifiable, 'telegram', notification);
    const chatId = route as string | number | undefined;
    if (chatId === undefined || chatId === null || chatId === '') {
      throw new Error(
        'The telegram channel needs a chat id. Return one from routeNotificationFor("telegram").',
      );
    }

    const url = `https://api.telegram.org/bot${this.options.botToken}/sendMessage`;
    await postJson(url, { chat_id: chatId, ...payload }, { label: 'Telegram' });
  }
}
