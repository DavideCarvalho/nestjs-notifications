import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import type { SseBackplane } from './backplane';
import { SseChannel, type SseChannelOptions } from './sse.channel';
import { SseHub } from './sse.hub';
import { SSE_BACKPLANE, SSE_OPTIONS } from './tokens';

export interface SseChannelModuleOptions {
  /** SSE event name (`type`) emitted to clients. Defaults to `'notification'`. */
  event?: string;
  /**
   * Cross-pod fan-out backplane (e.g. {@link import('./redis.backplane').RedisSseBackplane}). Omit
   * for in-process delivery (single node). Required when publishers and SSE connections live on
   * different processes.
   */
  backplane?: SseBackplane;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the SSE channel and its {@link SseHub}.
 *
 * The streaming endpoint itself is mounted by the consumer in their own
 * controller via NestJS's native `@Sse()` decorator — this module only provides
 * the hub (to read from) and the channel (to push into). See {@link SseChannel}
 * for the controller example.
 *
 * ```ts
 * SseChannelModule.forRoot({ event: 'notification' });
 * ```
 */
@Module({})
export class SseChannelModule {
  static forRoot(options: SseChannelModuleOptions = {}): DynamicModule {
    const channelOptions: SseChannelOptions = {
      event: options.event ?? 'notification',
    };

    const providers: Provider[] = [
      { provide: SSE_OPTIONS, useValue: channelOptions },
      { provide: SSE_BACKPLANE, useValue: options.backplane ?? null },
      SseHub,
      SseChannel,
    ];

    return {
      module: SseChannelModule,
      global: options.global ?? true,
      providers,
      exports: [SseHub, SseChannel],
    };
  }
}
