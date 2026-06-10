import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { BroadcastChannel, type BroadcastChannelOptions } from './broadcast.channel';
import { NotificationsGateway } from './gateway';
import { BROADCAST_OPTIONS } from './tokens';

export interface BroadcastChannelModuleOptions {
  /** Event name emitted to clients. Defaults to `'notification'`. */
  event?: string;
  /** socket.io namespace to mount the gateway on. */
  namespace?: string;
  /** Register globally so the channel is discoverable app-wide. Default true. */
  global?: boolean;
}

/**
 * Registers the broadcast channel and its socket.io gateway.
 *
 * ```ts
 * BroadcastChannelModule.forRoot({ event: 'notification', namespace: '/ws' });
 * ```
 */
@Module({})
export class BroadcastChannelModule {
  static forRoot(options: BroadcastChannelModuleOptions = {}): DynamicModule {
    const channelOptions: BroadcastChannelOptions = {
      event: options.event ?? 'notification',
    };

    // Re-apply the gateway decorator with the configured namespace, if any.
    if (options.namespace) {
      WebSocketGateway({ namespace: options.namespace })(NotificationsGateway);
    }

    const providers: Provider[] = [
      { provide: BROADCAST_OPTIONS, useValue: channelOptions },
      NotificationsGateway,
      BroadcastChannel,
    ];

    return {
      module: BroadcastChannelModule,
      global: options.global ?? true,
      providers,
      exports: [BroadcastChannel, NotificationsGateway],
    };
  }
}
