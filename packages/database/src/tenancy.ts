// Inbox helpers on top of the shared tenancy reader (`./tenancy-reader`, a verbatim copy of
// @dudousxd/nestjs-context's reference reader). The reader imports nothing from the context, so the
// database channel works with any context version, or with none at all: a missing or older
// accessor reads as `{ enabled: false }` and behaviour is unchanged.
import type { CapturedContext } from '@dudousxd/nestjs-notifications-core';
import { type Tenancy, type TenancyOption, readTenancy } from './tenancy-reader';

export { readTenancy };
export type { Tenancy, TenancyOption };

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
 * The option used on the send path. A send is not a request: senders, queues and workers stamp a
 * row with whatever tenant is active and never fail for a missing one, so `required` is off.
 */
export function sendTenancyOption(option: TenancyOption): TenancyOption {
  if (option === false) return false;
  return { ...(option === 'inherit' ? {} : option), required: false };
}

/**
 * The tenant id to stamp on a new row with tenancy on: the matched level's id in `tenant` mode and
 * `null` in `tenantless`/`all` mode. With no live context (`system`, e.g. an async worker), it falls
 * back to the tenant captured at `send()` time, matched the way the context would: the most specific
 * level of the chain whose kind this lib honours, of the configured `family` when one is set.
 */
export function stampTenantId(
  tenancy: Tenancy & { enabled: true },
  option: TenancyOption,
  accessor: unknown,
  captured: CapturedContext | undefined,
): string | null {
  const filter = tenancy.filter();
  if (filter.mode === 'tenant') return filter.tenant.id;
  if (filter.mode !== 'system') return null;
  const own = typeof option === 'object' ? option : {};
  return matchCaptured(captured, own.kinds ?? contextKinds(accessor), own.family);
}

function contextKinds(accessor: unknown): string[] | undefined {
  const slot = (globalThis as unknown as Record<symbol, { current?: unknown } | undefined>)[
    Symbol.for('@dudousxd/nestjs-diagnostics:accessor')
  ];
  const a = (accessor ?? slot?.current) as { tenancy?(): { kinds?: string[] } } | undefined;
  return typeof a?.tenancy === 'function' ? a.tenancy().kinds : undefined;
}

type Level = { id: string; kind: string };

function matchCaptured(
  captured: CapturedContext | undefined,
  kinds: string[] | undefined,
  family: string | undefined,
): string | null {
  if (!captured) return null;
  const primary: (Level & { family?: string; chain?: Level[] }) | undefined =
    captured.tenantId !== undefined
      ? { id: captured.tenantId, kind: captured.tenantKind ?? 'unknown' }
      : undefined;
  const all = captured.tenants ?? (primary ? [primary] : []);
  const candidates =
    family !== undefined
      ? all.filter((t) => t.family === family)
      : kinds === undefined
        ? primary
          ? [all.find((t) => t.id === primary.id) ?? primary]
          : []
        : all;
  for (const ref of candidates) {
    if (kinds === undefined) return ref.id;
    const chain: Level[] = ref.chain && ref.chain.length > 0 ? ref.chain : [ref];
    for (let i = chain.length - 1; i >= 0; i--) {
      const level = chain[i] as Level;
      if (kinds.includes(level.kind)) return level.id;
    }
  }
  return null;
}
