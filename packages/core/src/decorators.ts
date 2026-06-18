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

/**
 * A class constructor reference. Used purely as a by-identity cache key (and as the target of
 * `Reflect.getMetadata`), so a precise call signature is enough — and avoids the banned `Function`.
 */
type Ctor = abstract new (...args: never[]) => object;

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

// Per-class caches of immutable, class-static reflect-metadata. Keyed by the
// notification constructor; safe because this metadata is defined at class-decoration
// time and never changes for a given class. Dynamic, per-instance behaviour (e.g. a
// `via()` function or a tenant VALUE) is NOT cached.
const handlerCache = new WeakMap<Ctor, HandlerMap>();

function readHandlers(notification: Notification): HandlerMap {
  const ctor = notification.constructor as Ctor;
  const cached = handlerCache.get(ctor);
  if (cached !== undefined) return cached;
  const map = (Reflect.getMetadata(CHANNEL_HANDLERS, ctor) as HandlerMap | undefined) ?? {};
  handlerCache.set(ctor, map);
  return map;
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
const depsCache = new WeakMap<Ctor, NestPropertyDep[]>();

export function injectServices(notification: Notification, moduleRef: ModuleRef): void {
  const ctor = notification.constructor as Ctor;
  let deps = depsCache.get(ctor);
  if (deps === undefined) {
    deps = (Reflect.getMetadata(NEST_PROPERTY_DEPS, ctor) as NestPropertyDep[] | undefined) ?? [];
    depsCache.set(ctor, deps);
  }
  // Common-case fast path: nothing to inject.
  if (deps.length === 0) return;
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

// Cache the resolved tenant FIELD key per constructor. `null` is the sentinel for
// "resolved, no @Tenant field" (distinct from "not yet resolved"). The tenant VALUE is
// always read dynamically from the live instance below.
const tenantFieldCache = new WeakMap<Ctor, string | symbol | null>();

function readTenantField(target: object | undefined): string[] | undefined {
  if (!target) return undefined;
  const ctor = target.constructor as Ctor;
  let key = tenantFieldCache.get(ctor);
  if (key === undefined) {
    key = (Reflect.getMetadata(TENANT_FIELD, ctor) as string | symbol | undefined) ?? null;
    tenantFieldCache.set(ctor, key);
  }
  if (key === null) return undefined;
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
