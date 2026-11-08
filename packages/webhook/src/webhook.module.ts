import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { WEBHOOK_OPTIONS, WEBHOOK_OPTIONS_RESOLVER, WEBHOOK_TRANSACTION } from './tokens';
import {
  WebhookChannel,
  type WebhookChannelOptions,
  type WebhookOptionsResolver,
  type WebhookTransactionRunner,
} from './webhook.channel';

export interface WebhookChannelModuleOptions extends WebhookChannelOptions {
  /**
   * Optional per-tenant options resolver. When a notification is delivered with a
   * `context.tenant`, the returned options are used instead of the defaults.
   */
  resolveOptions?: WebhookOptionsResolver;
  /**
   * Opens a transaction for subscription delivery ({@link WebhookEvent}): `@nestjs/webhooks`
   * writes the event to the outbox through it, e.g. `(work) => db.transaction(work)`.
   */
  transaction?: WebhookTransactionRunner;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the webhook channel.
 *
 * ```ts
 * WebhookChannelModule.forRoot({ url: 'https://example.com/hooks', secret: 'whsec_…', signing: 'standard' });
 * ```
 */
@Module({})
export class WebhookChannelModule {
  static forRoot(options: WebhookChannelModuleOptions = {}): DynamicModule {
    const { resolveOptions, transaction, global, ...channelOptions } = options;
    const module = defineChannelModule({
      module: WebhookChannelModule,
      channel: WebhookChannel,
      optionsToken: WEBHOOK_OPTIONS,
      options: channelOptions,
      resolver: { token: WEBHOOK_OPTIONS_RESOLVER, value: resolveOptions },
      ...(global !== undefined ? { global } : {}),
    });
    return {
      ...module,
      providers: [
        ...(module.providers ?? []),
        { provide: WEBHOOK_TRANSACTION, useValue: transaction ?? null },
      ],
    };
  }
}
