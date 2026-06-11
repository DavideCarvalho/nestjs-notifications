import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
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

/** The slice of {@link SseChannelModuleOptions} a {@link SseChannelModuleAsyncOptions} factory returns. */
export interface SseChannelAsyncConfig {
  event?: string;
  backplane?: SseBackplane;
}

/** Async registration for {@link SseChannelModule.forRootAsync} — build options (e.g. the backplane) from DI. */
export interface SseChannelModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: never[]) => SseChannelAsyncConfig | Promise<SseChannelAsyncConfig>;
  inject?: FactoryProvider['inject'];
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/** Internal token holding the resolved async config. */
const SSE_RESOLVED_CONFIG = Symbol('SSE_RESOLVED_CONFIG');

/**
 * Registers the SSE channel and its {@link SseHub}.
 *
 * The streaming endpoint itself is mounted by the consumer in their own controller via NestJS's
 * native `@Sse()` decorator — this module only provides the hub (to read from) and the channel (to
 * push into). See {@link SseChannel} for the controller example.
 *
 * ```ts
 * SseChannelModule.forRoot({ event: 'notification' });
 *
 * // Build the backplane from DI (e.g. a Redis config service):
 * SseChannelModule.forRootAsync({
 *   inject: [AppConfig],
 *   useFactory: (cfg: AppConfig) => ({
 *     backplane: new RedisSseBackplane({ publisher: new Redis(cfg.redis), subscriber: new Redis(cfg.redis) }),
 *   }),
 * });
 * ```
 */
@Module({})
export class SseChannelModule {
  static forRoot(options: SseChannelModuleOptions = {}): DynamicModule {
    const channelOptions: SseChannelOptions = { event: options.event ?? 'notification' };

    return {
      module: SseChannelModule,
      global: options.global ?? true,
      providers: [
        { provide: SSE_OPTIONS, useValue: channelOptions },
        { provide: SSE_BACKPLANE, useValue: options.backplane ?? null },
        SseHub,
        SseChannel,
      ],
      exports: [SseHub, SseChannel],
    };
  }

  static forRootAsync(options: SseChannelModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: SSE_RESOLVED_CONFIG,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      {
        provide: SSE_OPTIONS,
        useFactory: (config: SseChannelAsyncConfig): SseChannelOptions => ({
          event: config.event ?? 'notification',
        }),
        inject: [SSE_RESOLVED_CONFIG],
      },
      {
        provide: SSE_BACKPLANE,
        useFactory: (config: SseChannelAsyncConfig): SseBackplane | null =>
          config.backplane ?? null,
        inject: [SSE_RESOLVED_CONFIG],
      },
      SseHub,
      SseChannel,
    ];

    return {
      module: SseChannelModule,
      global: options.global ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [SseHub, SseChannel],
    };
  }
}
