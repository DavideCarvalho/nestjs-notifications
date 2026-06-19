import {
  type DynamicModule,
  Global,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { attachNotificationsDiagnostics } from './attach-notifications-diagnostics';

/** Resolves the already-provided EventEmitter2 on init and attaches the diagnostics bridge; detaches
 *  on destroy. Warns and no-ops if EventEmitter2 is absent (full back-compat). */
@Injectable()
class NotificationsDiagnosticsAttacher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsDiagnosticsAttacher.name);
  private off: (() => void) | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    let emitter: EventEmitter2 | null = null;
    try {
      emitter = this.moduleRef.get(EventEmitter2, { strict: false });
    } catch {
      emitter = null;
    }
    if (!emitter) {
      this.logger.warn(
        'EventEmitter2 not found — did you import EventEmitterModule.forRoot()? Notifications diagnostics are off.',
      );
      return;
    }
    this.off = attachNotificationsDiagnostics(emitter);
  }

  onModuleDestroy(): void {
    this.off?.();
    this.off = null;
  }
}

/**
 * Import once at the app root (alongside `EventEmitterModule.forRoot()` and `NotificationsModule`) to
 * put notifications on the Aviary diagnostics bus — every send/sent/failed is then observable via
 * `@OnDiagnostic('notifications', ...)` or any `getChannel('notifications', ...)` subscriber.
 *
 * ```ts
 * @Module({ imports: [
 *   EventEmitterModule.forRoot(),
 *   NotificationsModule.forRoot({ ... }),
 *   NotificationsDiagnosticsModule.forRoot(),
 * ] })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class NotificationsDiagnosticsModule {
  static forRoot(): DynamicModule {
    return {
      module: NotificationsDiagnosticsModule,
      providers: [NotificationsDiagnosticsAttacher],
    };
  }
}
