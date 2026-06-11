import 'reflect-metadata';
import type { ModuleRef } from '@nestjs/core';
import type { ChannelRef, Notifiable, NotifiableRef, Notification } from './interfaces';

const CHANNEL_HANDLERS = Symbol('nestjs-notifications:channel-handlers');
const NOTIFIABLE_ROUTES = Symbol('nestjs-notifications:notifiable-routes');
const NOTIFIABLE_ID = Symbol('nestjs-notifications:notifiable-id');
const TENANT_FIELD = Symbol('nestjs-notifications:tenant-field');

// Key under which NestJS's own `@Inject()` stores property-injection metadata
// (PROPERTY_DEPS_METADATA from @nestjs/common): an array of { key, type }.
const NEST_PROPERTY_DEPS = 'self:properties_metadata';

/** Maps a channel name to the notification method that builds its payload. */
type HandlerMap = Record<string, string | symbol>;
interface NestPropertyDep {
  key: string | symbol;
  type: unknown;
}

/**
 * A channel handle: callable as a method decorator (`@Mail()`) and usable as a
 * type-safe value in `via()` (`return [Mail]`). Channel packages create one per channel.
 */
export interface ChannelHandle extends ChannelRef {
  (): MethodDecorator;
}

/**
 * Build a channel handle for a channel name. Each channel package exports one:
 *
 * ```ts
 * export const Mail = createChannel('mail');
 * ```
 */
export function createChannel(channel: string): ChannelHandle {
  const handle = (() => {
    const decorator: MethodDecorator = (target, propertyKey) => {
      const map: HandlerMap = {
        ...(Reflect.getOwnMetadata(CHANNEL_HANDLERS, target.constructor) as HandlerMap | undefined),
      };
      map[channel] = propertyKey;
      Reflect.defineMetadata(CHANNEL_HANDLERS, map, target.constructor);
    };
    return decorator;
  }) as ChannelHandle;
  Object.defineProperty(handle, 'channel', { value: channel, enumerable: true });
  return handle;
}

function readHandlers(notification: Notification): HandlerMap {
  return (
    (Reflect.getMetadata(CHANNEL_HANDLERS, notification.constructor) as HandlerMap | undefined) ??
    {}
  );
}

function toChannelName(channel: string | ChannelRef): string {
  return typeof channel === 'string' ? channel : channel.channel;
}

/**
 * Resolve the channels a notification targets. An explicit `via()` wins (and may return
 * names or {@link ChannelRef} handles); otherwise the channels are inferred from the
 * payload methods' channel decorators.
 */
export function resolveChannels(notification: Notification, notifiable: Notifiable): string[] {
  if (typeof notification.via === 'function') {
    return notification.via(notifiable).map(toChannelName);
  }
  return Object.keys(readHandlers(notification));
}

/**
 * Return the bound payload method for a channel: the decorator-mapped method if present,
 * else the `fallback` convention name (e.g. `toMail`). Undefined when neither exists.
 */
export function getHandler(
  notification: Notification,
  channel: string,
  fallback: string,
): ((...args: unknown[]) => unknown) | undefined {
  const method = readHandlers(notification)[channel] ?? fallback;
  const fn = (notification as Record<string | symbol, unknown>)[method];
  return typeof fn === 'function'
    ? (fn as (...args: unknown[]) => unknown).bind(notification)
    : undefined;
}

/**
 * Populate properties marked with NestJS's own `@Inject(TOKEN)` from the container. Because a
 * notification is `new`-ed (not created by Nest), Nest never wires these — so the library reads
 * Nest's property-injection metadata and fills them at delivery time. Idempotent: only fills
 * properties that are still undefined, so it is safe to call before every delivery.
 *
 * ```ts
 * class InvoicePaid {
 *   @Inject(UrlService) private urls!: UrlService; // the real @nestjs/common decorator
 * }
 * ```
 */
export function injectServices(notification: Notification, moduleRef: ModuleRef): void {
  const deps =
    (Reflect.getMetadata(NEST_PROPERTY_DEPS, notification.constructor) as
      | NestPropertyDep[]
      | undefined) ?? [];
  const target = notification as Record<string | symbol, unknown>;
  for (const { key, type } of deps) {
    if (target[key] === undefined) {
      try {
        target[key] = moduleRef.get(type as never, { strict: false });
      } catch {
        // Provider not found in the container — leave it unset rather than throw.
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Notifiable decorators — declare per-channel addresses without a switch      */
/* -------------------------------------------------------------------------- */

/**
 * Map a notifiable property to a channel address (no `routeNotificationFor` switch):
 *
 * ```ts
 * class User {
 *   @RouteFor('mail') email!: string;
 *   @RouteFor('sms') phone!: string;
 * }
 * ```
 */
export function RouteFor(channel: string): PropertyDecorator {
  return (target, propertyKey) => {
    const map: Record<string, string | symbol> = {
      ...(Reflect.getOwnMetadata(NOTIFIABLE_ROUTES, target.constructor) as
        | Record<string, string | symbol>
        | undefined),
    };
    map[channel] = propertyKey;
    Reflect.defineMetadata(NOTIFIABLE_ROUTES, map, target.constructor);
  };
}

/** Mark the property that holds the notifiable's id, for the async reference. */
export function NotifiableId(): PropertyDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(NOTIFIABLE_ID, propertyKey, target.constructor);
  };
}

function readRoutes(notifiable: Notifiable): Record<string, string | symbol> {
  return (
    (Reflect.getMetadata(NOTIFIABLE_ROUTES, notifiable.constructor) as
      | Record<string, string | symbol>
      | undefined) ?? {}
  );
}

/**
 * Resolve the address for a channel. An explicit `routeNotificationFor` method wins (dynamic
 * routing); otherwise the `@RouteFor(channel)` property is read.
 */
export function routeFor(
  notifiable: Notifiable,
  channel: string,
  notification?: Notification,
): unknown {
  if (typeof notifiable.routeNotificationFor === 'function') {
    return notifiable.routeNotificationFor(channel, notification as Notification);
  }
  const prop = readRoutes(notifiable)[channel];
  return prop === undefined ? undefined : (notifiable as Record<string | symbol, unknown>)[prop];
}

/**
 * Build the async reference for a notifiable. An explicit `toNotifiableRef()` wins; otherwise
 * it is derived from the `@Notifiable({ type })` (or class name) and the `@NotifiableId()`
 * property (defaulting to `id`).
 */
export function notifiableRef(notifiable: Notifiable): NotifiableRef {
  if (typeof notifiable.toNotifiableRef === 'function') {
    return notifiable.toNotifiableRef();
  }
  const ctor = notifiable.constructor as { notifiableType?: string; name: string };
  const idProp =
    (Reflect.getMetadata(NOTIFIABLE_ID, notifiable.constructor) as string | symbol | undefined) ??
    'id';
  const id = (notifiable as Record<string | symbol, unknown>)[idProp];
  if (id === undefined || id === null) {
    throw new Error(
      'Cannot build a notifiable reference. Implement toNotifiableRef(), or mark the id with ' +
        '@NotifiableId() (and optionally the type with @Notifiable({ type })).',
    );
  }
  return { type: ctor.notifiableType ?? ctor.name, id: id as string | number };
}

/* -------------------------------------------------------------------------- */
/*  Tenant decorator — scope a send to one or many tenants                      */
/* -------------------------------------------------------------------------- */

/**
 * Mark the property that carries the tenant scope on a notification (or notifiable). The value
 * may be a single tenant id or an array (the send fans out to each). Overridden by an explicit
 * `notifications.forTenant(id)` / `forTenants([...])`.
 *
 * ```ts
 * class InvoicePaid { @Tenant() workspaceId!: string; }
 * class Announcement { @Tenant() workspaces!: string[]; } // delivered per workspace
 * ```
 */
export function Tenant(): PropertyDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(TENANT_FIELD, propertyKey, target.constructor);
  };
}

function readTenantField(target: object | undefined): string[] | undefined {
  if (!target) return undefined;
  const key = Reflect.getMetadata(TENANT_FIELD, target.constructor) as string | symbol | undefined;
  if (key === undefined) return undefined;
  const value = (target as Record<string | symbol, unknown>)[key];
  if (value === undefined || value === null) return undefined;
  const list = (Array.isArray(value) ? value : [value]).map(String).filter((t) => t.length > 0);
  return list.length ? list : undefined;
}

/**
 * Resolve the tenant(s) for a send from the `@Tenant()` decorator — first on the notification,
 * then on the notifiable. Returns `undefined` when no tenant is declared (single-tenant).
 */
export function resolveTenants(notification: object, notifiable: object): string[] | undefined {
  return readTenantField(notification) ?? readTenantField(notifiable);
}
