/**
 * `@dudousxd/nestjs-notifications-delivery-tracking/mail`: records `@nestjs/mail`'s `MailEvents`
 * in the delivery-tracking store. Needs the optional peers `@nestjs/mail` and
 * `@dudousxd/nestjs-notifications-mail`.
 */
export { MailEventsDeliveryBridge, mailDeliveryTracking } from './mail/mail-events.bridge';
