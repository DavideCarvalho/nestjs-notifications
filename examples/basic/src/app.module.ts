import { NotificationsModule } from '@nestjs-notifications/core';
import { DatabaseChannelModule } from '@nestjs-notifications/database';
import { MailChannelModule } from '@nestjs-notifications/mail';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MemoryTransport } from './memory-transport';
import { InvoicePaid } from './notifications/invoice-paid.notification';

@Module({
  imports: [
    // Core uses @nestjs/event-emitter for lifecycle events — set it up once.
    EventEmitterModule.forRoot(),
    // The notifications engine. `notifications` is only needed for async dispatch.
    NotificationsModule.forRoot({ notifications: [InvoicePaid] }),
    // Mail channel with an in-memory transport (swap for SMTP via `smtp: {...}`).
    MailChannelModule.forRoot({ from: 'billing@example.com', transport: MemoryTransport }),
    // Database channel persisting to the bundled in-memory store.
    DatabaseChannelModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
