import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { NotificationStore } from './interfaces';
import { AUTO_CREATE_SCHEMA, NOTIFICATION_STORE } from './tokens';

/**
 * On bootstrap, asks the store to create its schema if missing (non-destructively), so the
 * library is self-contained out of the box. Disable with `autoCreateSchema: false` and manage
 * the schema through your ORM's migrations instead.
 */
@Injectable()
export class SchemaInitializer implements OnApplicationBootstrap {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    @Inject(AUTO_CREATE_SCHEMA)
    private readonly autoCreateSchema: boolean,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.autoCreateSchema) return;
    if (typeof this.store.ensureSchema !== 'function') return;
    try {
      await this.store.ensureSchema();
    } catch (error) {
      this.logger.error(
        `Failed to ensure the notifications schema: ${
          error instanceof Error ? error.message : String(error)
        }. Set autoCreateSchema: false and manage the schema via migrations if this is expected.`,
      );
    }
  }
}
