import { NotificationsModule } from '@dudousxd/nestjs-notifications-core';
import { DatabaseChannelModule } from '@dudousxd/nestjs-notifications-database';
import { MailChannelModule } from '@dudousxd/nestjs-notifications-mail';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { InMemoryMailTransport, MailModule } from '@nestjs/mail';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsInboxController } from './notifications/inbox.controller';
import { InvoicePaid } from './notifications/invoice-paid.notification';

@Module({
  imports: [
    // Core uses @nestjs/event-emitter for lifecycle events — set it up once.
    EventEmitterModule.forRoot(),
    // The notifications engine. `notifications` is only needed for async dispatch.
    NotificationsModule.forRoot({ notifications: [InvoicePaid] }),
    // Sending is @nestjs/mail's: an in-memory transport here (swap for `new SmtpTransport({...})`).
    MailModule.forRoot({ transport: new InMemoryMailTransport(), from: 'billing@example.com' }),
    // The mail channel renders each notification's MailMessage and sends it with the Mailer.
    MailChannelModule.forRoot(),
    // Database channel persisting to the bundled in-memory store. `routes: false` because
    // this example mounts its own static NotificationsInboxController (so nestjs-codegen can read
    // it) — by default forRoot() auto-mounts the inbox controller for you.
    DatabaseChannelModule.forRoot({ routes: false }),
  ],
  controllers: [AppController, NotificationsInboxController],
  providers: [AppService],
})
export class AppModule {}
