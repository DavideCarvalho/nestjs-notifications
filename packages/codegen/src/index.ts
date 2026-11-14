import type { RouteDescriptor } from '@dudousxd/nestjs-codegen';
import type { CodegenExtension } from '@dudousxd/nestjs-codegen/extension';

/** Options for {@link nestjsNotificationsCodegen}. */
export interface NotificationsCodegenOptions {
  /**
   * Path prefix the controllers are mounted under (e.g. `'/api'` → `/api/notifications`).
   * Default `''` (mounted at the root).
   */
  basePath?: string;
  /**
   * URL segment the inbox controller is mounted at (after `basePath`). Default `'notifications'`.
   * Set this when you mount `createNotificationsController({ path })` at a non-default path (e.g. to
   * avoid colliding with a `/notifications` page route). Independent of `name` (the client namespace).
   */
  path?: string;
  /** Route-name namespace for the generated client (`api.<name>.list`, …). Default `'notifications'`. */
  name?: string;
  /** Emit the in-app inbox routes (list/unread/count/read/read-all/delete). Default `true`. */
  inbox?: boolean;
  /** Emit the preference-center routes (categories/get/update). Default `false`. */
  preferences?: boolean;
}

// The wire shape the inbox API returns (StoredNotification with JSON/ISO dates).
const NOTIFICATION =
  '{ id: string; type: string; notifiableType: string; notifiableId: string; ' +
  'tenantId: string | null; data: Record<string, unknown>; readAt: string | null; ' +
  'createdAt: string; updatedAt: string }';
// The Aviary offset list envelope `GET {path}` answers.
const PAGINATED = `{ data: ${NOTIFICATION}[]; meta: { total: number; perPage: number; currentPage: number; lastPage: number; firstPage: number } }`;
// `filter[type]` is one type or a list (`A,B`), as a flat bracket key: the generated client sends
// query keys as-is (an array comma-joined), and the server reads it with or without a nested
// (`qs`) query parser.
const TYPE_FILTER = "{ 'filter[type]'?: string | string[] }";

function route(
  method: string,
  path: string,
  name: string,
  contract: { query: string | null; body: string | null; response: string },
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }> = [],
): RouteDescriptor {
  return { method, path, name, params, contract: { contractSource: contract } };
}

function inboxRoutes(base: string, path: string, ns: string): RouteDescriptor[] {
  const root = `${base}/${path}`;
  return [
    route('GET', root, `${ns}.list`, {
      // Aviary list API: `page` (1-based) + `size` (default 20, clamped to 100), `sort` accepts only
      // `-createdAt`, `filter[type]` narrows by notification type.
      query:
        "{ page?: number; size?: number; sort?: '-createdAt'; 'filter[type]'?: string | string[] }",
      body: null,
      response: PAGINATED,
    }),
    route('GET', `${root}/unread`, `${ns}.unread`, {
      query: TYPE_FILTER,
      body: null,
      response: `{ data: ${NOTIFICATION}[] }`,
    }),
    route('GET', `${root}/unread/count`, `${ns}.unreadCount`, {
      query: TYPE_FILTER,
      body: null,
      response: '{ count: number }',
    }),
    route(
      'POST',
      `${root}/:id/read`,
      `${ns}.markAsRead`,
      { query: null, body: null, response: 'void' },
      [{ name: 'id', source: 'path' }],
    ),
    route('POST', `${root}/read-all`, `${ns}.markAllAsRead`, {
      query: null,
      body: null,
      response: 'void',
    }),
    route('DELETE', `${root}/:id`, `${ns}.remove`, { query: null, body: null, response: 'void' }, [
      { name: 'id', source: 'path' },
    ]),
  ];
}

const CATEGORY =
  '{ key: string; label: string; description?: string; mandatory?: boolean; allowDigest?: boolean }';
const DIGEST = "'instant' | 'daily' | 'weekly' | 'off'";

function preferenceRoutes(base: string, ns: string): RouteDescriptor[] {
  return [
    route('GET', `${base}/preferences/categories`, `${ns}.preferences.categories`, {
      query: null,
      body: null,
      response: `${CATEGORY}[]`,
    }),
    route('GET', `${base}/preferences`, `${ns}.preferences.matrix`, {
      query: null,
      body: null,
      response: 'Record<string, unknown>',
    }),
    route(
      'PUT',
      `${base}/preferences/:category/channels/:channel`,
      `${ns}.preferences.setChannel`,
      { query: null, body: '{ enabled: boolean }', response: 'void' },
      [
        { name: 'category', source: 'path' },
        { name: 'channel', source: 'path' },
      ],
    ),
    route(
      'PUT',
      `${base}/preferences/:category/digest`,
      `${ns}.preferences.setDigest`,
      { query: null, body: `{ digest: ${DIGEST} }`, response: 'void' },
      [{ name: 'category', source: 'path' }],
    ),
  ];
}

/**
 * A [`@dudousxd/nestjs-codegen`](https://www.npmjs.com/package/@dudousxd/nestjs-codegen) extension
 * that emits the `@dudousxd/nestjs-notifications` HTTP routes into your generated `api.ts`, so the
 * inbox (and optionally the preference center) is available as a typed client / TanStack hooks in
 * your frontend.
 *
 * It injects the routes directly, so it works even when you mount the library's
 * `createNotificationsController` **factory** — which static AST discovery can't see. Register it
 * in your codegen config:
 *
 * ```ts
 * defineConfig({
 *   extensions: [nestjsNotificationsCodegen({ basePath: '/api', preferences: true })],
 * });
 * ```
 *
 * If you instead expose your own static, decorated notification controllers, codegen already
 * discovers those — don't add this (it would duplicate the routes).
 */
export function nestjsNotificationsCodegen(
  options: NotificationsCodegenOptions = {},
): CodegenExtension {
  const base = options.basePath ?? '';
  const path = (options.path ?? 'notifications').replace(/^\/+|\/+$/g, '');
  const ns = options.name ?? 'notifications';
  const injected: RouteDescriptor[] = [];
  if (options.inbox ?? true) injected.push(...inboxRoutes(base, path, ns));
  if (options.preferences) injected.push(...preferenceRoutes(base, ns));

  return {
    name: 'nestjs-notifications',
    transformRoutes(routes) {
      return [...routes, ...injected];
    },
  };
}
