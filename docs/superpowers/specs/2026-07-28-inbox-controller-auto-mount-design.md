# Inbox controller auto-mount: duplicate detection + ownership enforcement

Date: 2026-07-28
Packages: `@dudousxd/nestjs-notifications-database` (+ the three ORM adapters)

## Background

`DatabaseChannelModule.forRoot({ controller })` defaults `controller` to `true`, so registering the
database channel auto-mounts a `NotificationsController` at `notifications` with `defaultResolveRef`
and no guards. `inboxControllers()` disables the mount only on an explicit `false` — `undefined`
mounts it.

A downstream app (flip-nestjs, fixed there in PR #168) registered the channel in a global Core module
*and* mounted the inbox explicitly via `createNotificationsController({ path: 'notifications-inbox',
guards: [RolesGuard] })` in an API module. The author believed the explicit mount replaced the
default. It did not. Two consequences:

1. **Route shadowing.** The auto-mounted controller landed on the bare `/notifications`, which the
   app served as an Inertia page, and won the route by registering first. The page returned raw
   `{items, meta}` JSON.
2. **Unguarded twin.** The auto-mounted duplicate had no guards, so an app that deliberately mounted
   a guarded inbox silently also exposed an unguarded one.

Consequence 2 is worse than an information leak. `NotificationsQueryService.delete(id)` and
`markAsRead(id)` operate on a bare id with no ownership check, and the controller's `remove()` never
calls `resolveRef` at all. An unguarded mount therefore lets any caller delete or mark-read any
notification by id — an IDOR.

## Decisions

Three questions were put to the maintainer. The answers set the scope:

| Question | Decision |
| --- | --- |
| Flip `controller` to default `false`? | **No.** Keep the default `true`; a breaking flip is not wanted. |
| Enforce or warn on unguarded mounts? | **Neither.** No guard-related warning, throw, or type change. |
| Fix the IDOR? | **Yes, in this PR**, supporting both a store-scoped form and a `findById` fallback. |

Because the default stays `true`, duplicate-mount **detection** carries the entire "must stop being
silent" requirement on its own.

## Non-goals

- Changing the `controller` default, or any deprecation window toward changing it.
- Any warning, error, or type-level requirement relating to `guards`.
- `@dudousxd/nestjs-notifications-sse`. `SseChannelModule.forRoot`/`forRootAsync` return no
  `controllers`; `createNotificationsStreamController` is manual-only. There is no auto-mount to
  duplicate, and its `stream` sub-path cannot shadow the inbox routes. The only trait it shared with
  the database package was the optional-`guards` gap, which is explicitly out of scope. No code
  change.

## Part 1 — duplicate-mount detection

### Registry

New internal module `packages/database/src/inbox-registry.ts`:

```ts
export type InboxMountOrigin = 'auto' | 'manual';
export interface MountedInbox { path: string; origin: InboxMountOrigin }

export function recordInboxMount(mount: MountedInbox): void
export function mountedInboxes(): readonly MountedInbox[]
export function resetInboxRegistry(): void   // tests only
```

Not exported from `index.ts` — internal to the package.

### Distinguishing the two mount paths

`notifications.controller.ts` splits into a public wrapper and an internal builder:

```ts
export function createNotificationsController(options: NotificationsControllerOptions): Type<unknown> {
  return buildNotificationsController(options, 'manual');
}

/** @internal */
export function buildNotificationsController(
  options: NotificationsControllerOptions,
  origin: InboxMountOrigin,
): Type<unknown>
```

`database.module.ts`'s `inboxControllers()` calls `buildNotificationsController(opts, 'auto')`.
`index.ts` re-exports only `createNotificationsController`, so the public API is unchanged.

### Audit

`InboxMountAudit`, an `@Injectable()` implementing `OnApplicationBootstrap`, is added to the
`providers` of both `forRoot()` and `forFeature()`. On bootstrap it warns when the registry holds at
least one `auto` mount **and** at least one `manual` mount:

```
Notifications  DatabaseChannelModule auto-mounted an inbox controller at "notifications", and your
application mounted its own at "notifications-inbox" via createNotificationsController(). Mounting
your own does NOT disable the auto-mounted one — both are live. Pass `controller: false` to
DatabaseChannelModule.forRoot() to disable the auto-mount.
```

The message names the misconception explicitly ("does NOT disable"), lists every mounted path so a
same-path collision is visible, and gives the one-line fix.

Uses `new Logger('Notifications')`, matching `notification-pruner.ts`, `database.channel.ts`, and
`schema-initializer.ts`.

**Why bootstrap, not `forRoot()`:** module metadata evaluation order between a global Core module and
a feature module is not deterministic, so a synchronous check inside `forRoot()` would miss a manual
mount evaluated later. By `onApplicationBootstrap` every controller factory has run.

**Why warn, not throw:** Nest HMR can re-evaluate module metadata within one process and produce a
duplicate record that is not a real duplicate mount. A warning degrades safely there; a throw would
break dev servers on a false positive.

## Part 2 — ownership enforcement

### Store contract

Three optional additions to `NotificationStore`, following the existing optional-with-documented-
fallback convention of `paginateForNotifiable?`, `prune?`, and `upsert?`:

```ts
export interface NotificationOwnerRef {
  notifiableType: string;
  notifiableId: string;
  /** Tenant scope; `undefined` matches all tenants (single-tenant behavior). */
  tenantId?: string | undefined;
}

interface NotificationStore {
  /** Optional. Delete only when the row belongs to `owner`. Resolves true when a row was deleted. */
  deleteOwned?(id: string, owner: NotificationOwnerRef): Promise<boolean>;
  /** Optional. Mark read only when the row belongs to `owner`. Resolves true when a row matched. */
  markAsReadOwned?(id: string, owner: NotificationOwnerRef): Promise<boolean>;
  /** Optional. Fetch one row by id, or null. Ownership fallback when the scoped forms are absent. */
  findById?(id: string): Promise<StoredNotification | null>;
}
```

Distinct method names rather than an optional second parameter on the existing `delete(id)`: an
added optional parameter is silently ignored by an existing implementation, so the store would appear
to enforce ownership while not enforcing it. That is precisely the silent-failure class this change
exists to remove. Named optional methods are detectable at runtime.

`markAsReadOwned` resolving `true` means "a row matched the owner", including a row that was already
read — matching the existing idempotent `markAsRead` semantics, which no-ops on an already-read row.

### Resolution order

`NotificationsQueryService.delete(id, target?)` and `markAsRead(id, target?)`:

1. **No `target`** → unchecked `store.delete(id)` / `store.markAsRead(id)`. Preserves today's
   behavior for programmatic callers that legitimately act outside a request.
2. **`target` + scoped method present** → `store.deleteOwned(id, owner)`; `false` throws
   `NotFoundException`. One round trip, predicate in the `WHERE` clause, no TOCTOU window.
3. **`target` + `findById` present** → fetch, compare `notifiableType`/`notifiableId` and, when the
   owner ref carries a `tenantId`, `tenantId`. Null or mismatch throws `NotFoundException`;
   otherwise the unscoped mutation runs.
4. **`target` + neither** → log a warning once per process naming the store, then run unchecked.
   A third-party store that cannot enforce ownership degrades loudly rather than silently.

`NotFoundException`, not `ForbiddenException`: a distinguishable "exists but not yours" response
turns the endpoint into an id-enumeration oracle.

### Callers

- `notifications.controller.ts` `remove()` gains `@Req() req`, resolves the ref, and passes it. It
  currently ignores the request entirely.
- `markAsRead` already resolves the ref and passes it as `target` (used only to broadcast the
  cross-device read event today); that same ref now also enforces ownership.
- `forTenant(tenant)` threads its tenant into the owner ref for `delete` and `markAsRead`. Today
  `forTenant(t).delete(id)` delegates to `this.delete(id)` and drops the tenant scope.

### Adapters

`InMemoryStore`, `TypeOrmNotificationStore`, `MikroOrmNotificationStore`, and
`PrismaNotificationStore` implement all three methods, pushing the owner predicate into the query
for the two scoped forms.

## Testing

| File | Covers |
| --- | --- |
| `packages/database/src/database.module.spec.ts` (new) | `PATH_METADATA` read off `forRoot().controllers` for default / `false` / `true` / `{ path }` / `forFeature`. No Nest boot. |
| `packages/database/src/inbox-registry.spec.ts` (new) | Record/read/reset; auto+manual, auto-only, manual-only, and same-path combinations produce or suppress the warning. `resetInboxRegistry()` between cases. |
| `packages/database/src/notifications-query.service.spec.ts` | All four resolution branches for `delete` and `markAsRead`, including the warn-and-degrade path and the tenant-scoped ref. |
| `packages/database/src/in-memory.store.contract.spec.ts` + `contract.testkit.ts` | Cross-owner delete/mark-read rejected, same-owner accepted, tenant mismatch rejected, `findById` hit/miss. Shared testkit means all three ORM adapters assert the same behavior. |

The `PATH_METADATA` assertion the maintainer sketched:

```js
const mod = DatabaseChannelModule.forRoot({ autoCreateSchema: false })
mod.controllers.map(c => Reflect.getMetadata(PATH_METADATA, c))  // -> ['notifications']
```

## Release

One `minor` changeset (0.13.1 → 0.14.0) for `@dudousxd/nestjs-notifications-database` plus the three
adapters.

Not breaking at the type level — every store addition is optional. The behavior change worth calling
out: the inbox controller's `DELETE /:id` and `POST /:id/read` now return 404 for a notification the
requester does not own. Correct clients are unaffected.

Publishing runs through CI via changesets on push to `main`. No local `npm publish`.

## Docs

Root `website/content/docs` (not per-package):

- `recipes/in-app-notifications.mdx` — the auto-mount section gains an explicit warning that
  `createNotificationsController` does not replace the auto-mounted controller, and that
  `controller: false` is required alongside a manual mount. Document the ownership behavior of the
  mutation endpoints.
- `channels/database.mdx` — the store table gains the three new optional methods.

MDX must stay valid; one broken page blocks the whole docs deploy.
