import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { WEBHOOK_OPTIONS } from './tokens';
import { WebhookChannel, type WebhookChannelOptions } from './webhook.channel';

export interface WebhookChannelModuleOptions {
  /** Default URL used when neither the message nor the route supplies one. */
  url?: string;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the webhook channel.
 *
 * ```ts
 * WebhookChannelModule.forRoot({ url: 'https://example.com/hooks/notifications' });
 * ```
 */
@Module({})
export class WebhookChannelModule {
  static forRoot(options: WebhookChannelModuleOptions = {}): DynamicModule {
    const webhookOptions: WebhookChannelOptions = {
      url: options.url,
      headers: options.headers,
    };

    const providers: Provider[] = [
      { provide: WEBHOOK_OPTIONS, useValue: webhookOptions },
      WebhookChannel,
    ];

    return {
      module: WebhookChannelModule,
      global: options.global ?? true,
      providers,
      exports: [WebhookChannel],
    };
  }
}
