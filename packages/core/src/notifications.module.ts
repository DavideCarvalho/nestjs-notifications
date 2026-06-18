import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ChannelRegistry } from './channel-registry';
import { ChannelRunner } from './channel-runner';
import { DispatchGuards } from './dispatch-guard.service';
import { LocalizationService } from './localization.service';
import { NotificationService } from './notification.service';
import type { NotificationsModuleAsyncOptions, NotificationsModuleOptions } from './options';
import { NotificationSerializer } from './serializer';
import { SyncDispatcher } from './sync.dispatcher';
import { NOTIFICATION_DISPATCHER, NOTIFICATION_OPTIONS } from './tokens';

const CORE_PROVIDERS: Provider[] = [
  NotificationSerializer,
  ChannelRegistry,
  ChannelRunner,
  DispatchGuards,
  LocalizationService,
  NotificationService,
];

const EXPORTS = [
  NotificationService,
  ChannelRegistry,
  ChannelRunner,
  NotificationSerializer,
  LocalizationService,
  NOTIFICATION_DISPATCHER,
  NOTIFICATION_OPTIONS,
];

@Module({})
export class NotificationsModule {
  static forRoot(options: NotificationsModuleOptions = {}): DynamicModule {
    const resolved: NotificationsModuleOptions = {
      errorPolicy: 'continueOnError',
      global: true,
      ...options,
    };

    const providers: Provider[] = [
      { provide: NOTIFICATION_OPTIONS, useValue: resolved },
      ...CORE_PROVIDERS,
      ...dispatcherProviders(resolved.dispatcher),
      ...(options.providers ?? []),
    ];

    return {
      module: NotificationsModule,
      // Spread `global` only when set: NestJS's `DynamicModule.global` is `?: boolean`, and under
      // exactOptionalPropertyTypes an explicit `undefined` is rejected.
      ...(resolved.global !== undefined ? { global: resolved.global } : {}),
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers,
      exports: EXPORTS,
    };
  }

  static forRootAsync(options: NotificationsModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: NOTIFICATION_OPTIONS,
        useFactory: async (...args: any[]) => ({
          errorPolicy: 'continueOnError' as const,
          ...(await options.useFactory(...args)),
        }),
        inject: options.inject ?? [],
      },
      ...CORE_PROVIDERS,
      ...dispatcherProviders(options.dispatcher),
      ...(options.providers ?? []),
    ];

    return {
      module: NotificationsModule,
      global: options.global ?? true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers,
      exports: EXPORTS,
    };
  }
}

function dispatcherProviders(dispatcher?: NotificationsModuleOptions['dispatcher']): Provider[] {
  if (!dispatcher) {
    return [SyncDispatcher, { provide: NOTIFICATION_DISPATCHER, useExisting: SyncDispatcher }];
  }
  // The SyncDispatcher stays available so custom dispatchers can delegate to inline delivery.
  return [
    SyncDispatcher,
    dispatcher,
    { provide: NOTIFICATION_DISPATCHER, useExisting: dispatcher },
  ];
}
