import {
  CONTEXT_ACCESSOR,
  type ChannelDriver,
  type DeliveryContext,
  type Notifiable,
  type NotifiableRef,
  type Notification,
  createChannel,
  getHandler,
  notifiableRef,
  notificationName,
  routeFor,
} from '@dudousxd/nestjs-notifications-core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { DatabaseNotification, NewStoredNotification, NotificationStore } from './interfaces';
import { type TenancyOption, readTenancy, stampTenantId } from './tenancy';
import { DATABASE_TENANCY, NOTIFICATION_STORE } from './tokens';

/** Channel handle: use as `@Database()` on a payload method, or as a token in `via()`. */
export const Database = createChannel('database');

/**
 * Persists notifications via a {@link NotificationStore} so they can be shown in-app.
 * Reads the payload from `toDatabase()`, then `toArray()`, then a structural copy.
 */
@Injectable()
export class DatabaseChannel implements ChannelDriver {
  readonly channel = 'database';
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATION_STORE)
    private readonly store: NotificationStore,
    // The nestjs-context accessor, read structurally. Absent → the global slot, else tenancy off.
    @Optional()
    @Inject(CONTEXT_ACCESSOR)
    private readonly contextAccessor?: unknown,
    @Optional()
    @Inject(DATABASE_TENANCY)
    private readonly tenancy: TenancyOption = 'inherit',
  ) {}

  async send(
    notifiable: Notifiable,
    notification: Notification,
    context?: DeliveryContext,
  ): Promise<unknown> {
    const ref = this.referenceFor(notifiable, notification);
    const data = this.payloadFor(notifiable, notification, context);
    // Instance-aware (notificationType() → @Notification({ name }) → class name) via core's
    // helper — this is what the inbox `?type=` filter matches against, so a generic class
    // carrying many event names persists the real per-instance type, not the class constant.
    const type = notificationName(notification);

    // WHO triggered this + the trace, captured from nestjs-context at send() time (present
    // here even for async deliveries — the carrier rides through the dispatcher). The delivery
    // tenant wins for `tenantId`; when unscoped we fall back to the captured tenant so the row
    // is still attributable. With tenancy on, an unscoped send is stamped by the matching rule
    // instead: the context tenant, or no tenant for a tenantless request. The causer/trace keys are added ONLY when a context was captured —
    // omitted otherwise so a schema-first store (Prisma) without these columns is unaffected.
    const captured = context?.captured;
    const input: NewStoredNotification = {
      type,
      notifiableType: ref.type,
      notifiableId: String(ref.id),
      tenantId: context?.tenant ?? this.unscopedTenantId(captured),
      data,
      ...(captured
        ? {
            causerType: captured.causer?.type ?? null,
            causerId: captured.causer?.id != null ? String(captured.causer.id) : null,
            traceId: captured.traceId ?? null,
          }
        : {}),
    };

    // A stable databaseKey means "update this row in place" (live/progress notifications).
    const key = this.upsertKeyFor(notifiable, notification);
    if (key != null) {
      if (typeof this.store.upsert === 'function') {
        return this.store.upsert({ id: key, ...input });
      }
      this.logger.warn(
        `Notification "${type}" returned a databaseKey but the store does not implement upsert(); inserting a new row instead. Implement NotificationStore.upsert to update in place.`,
      );
    }

    // Return the stored row so it flows into afterSending() and the SendResult.
    return this.store.save(input);
  }

  /** The tenant to stamp on a send with no explicit tenant. */
  private unscopedTenantId(captured: DeliveryContext['captured']): string | null {
    const tenancy = readTenancy(this.tenancy ?? 'inherit', this.contextAccessor);
    if (!tenancy.enabled) return captured?.tenantId ?? null;
    return stampTenantId(tenancy, captured);
  }

  private upsertKeyFor(
    notifiable: Notifiable,
    notification: DatabaseNotification,
  ): string | undefined {
    return typeof notification.databaseKey === 'function'
      ? notification.databaseKey(notifiable)
      : undefined;
  }

  private referenceFor(notifiable: Notifiable, notification: Notification): NotifiableRef {
    // A { type, id } returned from the 'database' route wins; otherwise derive the ref from
    // toNotifiableRef() or the @Notifiable/@NotifiableId decorators.
    const routed = routeFor(notifiable, 'database', notification);
    if (isRef(routed)) return routed;
    return notifiableRef(notifiable);
  }

  private payloadFor(
    notifiable: Notifiable,
    notification: DatabaseNotification,
    context?: DeliveryContext,
  ): Record<string, unknown> {
    const handler = getHandler(notification, 'database', 'toDatabase');
    if (handler)
      return handler({
        notifiable,
        localization: context?.localization,
        tenant: context?.tenant,
      }) as Record<string, unknown>;
    if (typeof notification.toArray === 'function') return notification.toArray(notifiable);
    const { ...rest } = notification as unknown as Record<string, unknown>;
    return rest;
  }
}

function isRef(value: unknown): value is NotifiableRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'id' in value &&
    typeof (value as NotifiableRef).type === 'string'
  );
}
