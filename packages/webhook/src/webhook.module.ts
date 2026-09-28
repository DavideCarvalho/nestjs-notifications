import { defineChannelModule } from '@dudousxd/nestjs-notifications-core';
import { type DynamicModule, Module } from '@nestjs/common';
import { WEBHOOK_OPTIONS, WEBHOOK_OPTIONS_RESOLVER } from './tokens';
import {
  WebhookChannel,
  type WebhookChannelOptions,
  type WebhookOptionsResolver,
} from './webhook.channel';

export interface WebhookChannelModuleOptions {
  /** Default URL used when neither the message nor the route supplies one. */
  url?: string;
  /** Default headers merged into every request. */
  headers?: Record<string, string>;
  /**
   * HMAC-SHA256 signing secret. When set, every request carries
   * `<signatureHeader>: sha256=<hex digest of the JSON body>`.
   */
  secret?: string;
  /** Header name for the signature. Default `X-Signature-256`. */
  signatureHeader?: string;
  /** Abort a request that takes longer than this (ms). Unset = no timeout. */
  timeoutMs?: number;
  /** Redirect handling: `'follow'` (default), `'error'` or `'manual'`. */
  redirect?: 'follow' | 'error' | 'manual';
  /**
   * Optional per-tenant options resolver. When a notification is delivered with a
   * `context.tenant`, the returned options are used instead of the defaults.
   */
  resolveOptions?: WebhookOptionsResolver;
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
      // Set each field only when provided (exactOptionalPropertyTypes); the channel resolves a
      // per-notifiable URL and default headers when these are absent.
      ...(options.url !== undefined ? { url: options.url } : {}),
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
      ...(options.secret !== undefined ? { secret: options.secret } : {}),
      ...(options.signatureHeader !== undefined
        ? { signatureHeader: options.signatureHeader }
        : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.redirect !== undefined ? { redirect: options.redirect } : {}),
    };

    return defineChannelModule({
      module: WebhookChannelModule,
      channel: WebhookChannel,
      optionsToken: WEBHOOK_OPTIONS,
      options: webhookOptions,
      resolver: { token: WEBHOOK_OPTIONS_RESOLVER, value: options.resolveOptions },
      ...(options.global !== undefined ? { global: options.global } : {}),
    });
  }
}
