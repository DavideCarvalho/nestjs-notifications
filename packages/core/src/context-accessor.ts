/**
 * Local, structural mirror of `@dudousxd/nestjs-context`'s public accessor.
 *
 * We deliberately do NOT import nestjs-context (it is an OPTIONAL peer). Instead we
 * declare the same shape here and inject it via the shared {@link CONTEXT_ACCESSOR}
 * token with `@Optional()`. Any object that structurally satisfies this interface —
 * including nestjs-context's real accessor — works. When no accessor is bound, the
 * notification path behaves exactly as before (no captured context).
 *
 * Kept byte-aligned with nestjs-context's `ContextAccessor`.
 */
export interface UserRef {
  type: string;
  id: string | number;
}

/** Opaque shape of the context store. notifications never reads it directly. */
export type ContextStore = Record<string, unknown>;

/** One level of a tenant hierarchy (e.g. a clinic, then one of its units). */
export interface ContextTenantLevel {
  id: string;
  kind: string;
  slug?: string;
  role?: string;
}

/** The customer the request's data belongs to, as `@dudousxd/nestjs-context` describes it. */
export interface ContextTenantRef extends ContextTenantLevel {
  source: string;
  /** The active hierarchy, root first, this tenant last. Absent for a flat tenant. */
  chain?: ContextTenantLevel[];
  /** The tenant family, when a request carries more than one tenant. */
  family?: string;
}

/** How a lib must scope tenant data right now. See the context "Tenancy" docs. */
export type ContextTenantFilter =
  | { mode: 'system' }
  | { mode: 'all' }
  | { mode: 'tenantless' }
  | { mode: 'tenant'; tenant: ContextTenantRef; chain?: ContextTenantLevel[] };

export interface ContextAccessor {
  /** Trace id for the current request, or `undefined` when unavailable. */
  traceId(): string | undefined;
  /** Current tenant id, or `undefined` when no multi-tenant context is populated. */
  tenantId(): string | undefined;
  /** Reference to the current user, or `undefined` when unauthenticated. */
  userRef(): UserRef | undefined;
  /** The raw context store for the current request, or `undefined`. */
  get(): ContextStore | undefined;
  /** The active tenant. Optional: older contexts lack it, which reads as tenancy off. */
  tenant?(): ContextTenantRef | undefined;
  /** Every active tenant, primary first. Optional: contexts before 2.1 lack it. */
  tenants?(): ContextTenantRef[];
  /** The context's tenancy switch. Optional, as above. */
  tenancy?(): { enabled: boolean; kinds?: string[]; required?: boolean };
  /** How data must be scoped right now. Optional, as above. */
  tenantFilter?(options?: {
    kinds?: string[];
    family?: string;
    required?: boolean;
  }): ContextTenantFilter;
}

/** A tenant level as captured at `send()` time. */
export interface CapturedTenantLevel {
  id: string;
  kind: string;
}

/** A tenant of a nested or multi-family context, as captured at `send()` time. */
export interface CapturedTenant extends CapturedTenantLevel {
  /** The tenant family, when the context names one. */
  family?: string;
  /** The active hierarchy, root first, this tenant last. Absent for a flat tenant. */
  chain?: CapturedTenantLevel[];
}

/**
 * The request-scoped context captured at `send()` time and threaded through the
 * lifecycle, events, async dispatch carrier, and the database store. Every field is
 * optional — an absent accessor (or an accessor that returns `undefined`) yields an
 * empty/omitted capture and the delivery is unchanged.
 */
export interface CapturedContext {
  /** Who triggered the notification (the current user/actor), if known. */
  causer?: UserRef;
  /** The tenant the trigger happened in, if multi-tenant context is populated. */
  tenantId?: string;
  /** The kind of that tenant (`'organization'`, …), when the context reports one. */
  tenantKind?: string;
  /**
   * Every active tenant, primary first, with its chain and family. Set only when the context
   * reports a nested chain or more than one tenant family, so an async worker can stamp the level
   * a lib scopes by (e.g. the clinic of a unit).
   */
  tenants?: CapturedTenant[];
  /** Correlation/trace id of the triggering request, for end-to-end tracing. */
  traceId?: string;
}

/**
 * Snapshot the current request context into a plain, JSON-safe {@link CapturedContext}.
 * Returns `undefined` when the accessor is absent or yields nothing — callers then leave
 * the capture off entirely (full back-compat). Defensive: any accessor throw is swallowed.
 */
export function captureContext(accessor?: ContextAccessor): CapturedContext | undefined {
  if (!accessor) return undefined;
  try {
    const causer = accessor.userRef();
    const tenantId = accessor.tenantId();
    const traceId = accessor.traceId();
    const captured: CapturedContext = {};
    if (causer) captured.causer = { type: causer.type, id: causer.id };
    if (tenantId !== undefined) {
      captured.tenantId = tenantId;
      const kind = typeof accessor.tenant === 'function' ? accessor.tenant()?.kind : undefined;
      if (kind !== undefined) captured.tenantKind = kind;
    }
    const tenants = captureTenants(accessor);
    if (tenants) captured.tenants = tenants;
    if (traceId !== undefined) captured.traceId = traceId;
    return Object.keys(captured).length > 0 ? captured : undefined;
  } catch {
    return undefined;
  }
}

const level = (l: ContextTenantLevel): CapturedTenantLevel => ({ id: l.id, kind: l.kind });

/** The tenants worth carrying: only when one has a chain or a family (else `tenantId` says it all). */
function captureTenants(accessor: ContextAccessor): CapturedTenant[] | undefined {
  if (typeof accessor.tenants !== 'function') return undefined;
  const refs = accessor.tenants() ?? [];
  if (!refs.some((r) => (r.chain?.length ?? 0) > 1 || r.family !== undefined)) return undefined;
  return refs.map((r) => {
    const t: CapturedTenant = level(r);
    if (r.family !== undefined) t.family = r.family;
    if (r.chain && r.chain.length > 1) t.chain = r.chain.map(level);
    return t;
  });
}
