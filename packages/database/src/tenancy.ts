// Local reader for the @dudousxd/nestjs-context tenancy contract. It imports nothing from the
// context, so the database channel works with any context version, or with none at all: a missing
// or older accessor reads as `{ enabled: false }` and behaviour is unchanged.

/** The tenant the request runs in, as the context reports it. */
export interface InboxTenantRef {
  id: string;
  kind: string;
  source: string;
  slug?: string;
  role?: string;
}

type TenantFilter =
  | { mode: 'system' }
  | { mode: 'all' }
  | { mode: 'tenantless' }
  | { mode: 'tenant'; tenant: InboxTenantRef };

/**
 * The `tenancy` option of {@link import('./database.module').DatabaseChannelModule}.
 *
 * - `'inherit'` (default): follow `ContextModule`'s `tenancy.enabled`, which is off by default.
 * - `false`: never scope the inbox by tenant.
 * - an object: `enabled` (`'inherit'` or a boolean), the lib's own `kinds` allow-list, and
 *   `nullRows` (`'tenantless'` by default; `'shared'` also shows rows with no tenant to every tenant).
 */
export type TenancyOption =
  | 'inherit'
  | false
  | { enabled?: 'inherit' | boolean; kinds?: string[]; nullRows?: 'tenantless' | 'shared' };

export type Tenancy =
  | { enabled: false }
  | {
      enabled: true;
      nullRows: 'tenantless' | 'shared';
      /** The kinds this lib honours (its own, else the context's); `undefined` = every kind. */
      kinds: string[] | undefined;
      filter(): TenantFilter;
    };

interface Accessor {
  tenancy?(): { enabled: boolean; kinds?: string[] };
  tenantFilter?(options?: { kinds?: string[] }): TenantFilter;
}
const SLOT = Symbol.for('@dudousxd/nestjs-diagnostics:accessor');

/** `accessor`: the `CONTEXT_ACCESSOR` injected with `@Optional()`, if any. Call per operation. */
export function readTenancy(option: TenancyOption = 'inherit', accessor?: unknown): Tenancy {
  const slot = (globalThis as unknown as Record<symbol, { current?: unknown } | undefined>)[SLOT];
  const a = (accessor ?? slot?.current) as Accessor | null | undefined;
  if (option === false || typeof a?.tenancy !== 'function' || !a.tenantFilter) {
    return { enabled: false };
  }
  const tenantFilter = a.tenantFilter.bind(a);
  const own = typeof option === 'object' ? option : {};
  const inherit = own.enabled === undefined || own.enabled === 'inherit';
  const context = a.tenancy();
  if (!(inherit ? context.enabled : own.enabled)) return { enabled: false };
  const kinds = own.kinds;
  return {
    enabled: true,
    nullRows: own.nullRows ?? 'tenantless',
    kinds: kinds ?? context.kinds,
    filter: () => tenantFilter(kinds ? { kinds } : undefined),
  };
}

/**
 * How one inbox operation is scoped, resolved once per call:
 * - `tenant`: the value to push into the store's `tenantId` argument (`undefined` = any tenant).
 * - `visible`: set when the matching rule needs a check the store can't express (rows with no
 *   tenant). Rows are then read across tenants and kept only when `visible(row.tenantId)`.
 * - `fromContext`: whether the scope came from the context rather than an explicit `forTenant`.
 */
export interface InboxScope {
  tenant: string | undefined;
  visible?: ((rowTenantId: string | null) => boolean) | undefined;
  fromContext: boolean;
}

/**
 * Resolve the scope of one inbox operation. An explicit tenant (`forTenant(id)`) always wins and
 * keeps today's exact-match behaviour. Otherwise, with tenancy on, the matching rule applies:
 * a tenant sees its own rows (plus rows with no tenant under `nullRows: 'shared'`), a tenantless
 * request sees only rows with no tenant, and `all`/`system` see everything.
 */
export function inboxScope(explicit: string | undefined, tenancy: Tenancy): InboxScope {
  if (explicit !== undefined || !tenancy.enabled) {
    return { tenant: explicit, fromContext: false };
  }
  const filter = tenancy.filter();
  if (filter.mode === 'system' || filter.mode === 'all') {
    return { tenant: undefined, fromContext: false };
  }
  if (filter.mode === 'tenant') {
    const id = filter.tenant.id;
    if (tenancy.nullRows !== 'shared') return { tenant: id, fromContext: true };
    return {
      tenant: undefined,
      visible: (row) => row === null || row === undefined || row === id,
      fromContext: true,
    };
  }
  return {
    tenant: undefined,
    visible: (row) => row === null || row === undefined,
    fromContext: true,
  };
}

/**
 * The tenant id to stamp on a new row with tenancy on: the active tenant's id in `tenant` mode and
 * `null` in `tenantless`/`all` mode. With no live context (`system`, e.g. an async worker), it falls
 * back to the tenant captured at `send()` time, when its kind is one this lib honours.
 */
export function stampTenantId(
  tenancy: Tenancy & { enabled: true },
  captured: { tenantId?: string; tenantKind?: string } | undefined,
): string | null {
  const filter = tenancy.filter();
  if (filter.mode === 'tenant') return filter.tenant.id;
  if (filter.mode !== 'system' || captured?.tenantId === undefined) return null;
  const kind = captured.tenantKind ?? 'unknown';
  return tenancy.kinds === undefined || tenancy.kinds.includes(kind) ? captured.tenantId : null;
}
