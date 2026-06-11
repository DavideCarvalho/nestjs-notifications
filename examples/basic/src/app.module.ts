import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import { DatabaseChannelModule } from '@dudousxd/nestjs-notifications-database';
import { MailChannelModule } from '@dudousxd/nestjs-notifications-mail';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MemoryTransport } from './memory-transport';
import { NotificationsInboxController } from './notifications/inbox.controller';
import { InvoicePaid } from './notifications/invoice-paid.notification';

@Module({
  imports: [
    // Core uses @nestjs/event-emitter for lifecycle events — set it up once.
    EventEmitterModule.forRoot(),
    // The notifications engine. `notifications` is only needed for async dispatch.
    NotificationsModule.forRoot({ notifications: [InvoicePaid] }),
    // Mail channel with an in-memory transport (swap for SMTP via `smtp: {...}`).
    MailChannelModule.forRoot({ from: 'billing@example.com', transport: MemoryTransport }),
    // Database channel persisting to the bundled in-memory store. `controller: false` because
    // this example mounts its own static NotificationsInboxController (so nestjs-codegen can read
    // it) — by default forRoot() auto-mounts the inbox controller for you.
    DatabaseChannelModule.forRoot({ controller: false }),
  ],
  controllers: [AppController, NotificationsInboxController],
  providers: [AppService],
})
export class AppModule {}
