# @dudousxd/nestjs-notifications-codegen

A [`@dudousxd/nestjs-codegen`](https://www.npmjs.com/package/@dudousxd/nestjs-codegen) **extension**
that emits the [`@dudousxd/nestjs-notifications`](https://github.com/DavideCarvalho/nestjs-notifications)
HTTP API (in-app inbox, optionally the preference center) into your generated `api.ts` — so the
notifications endpoints are available as a typed client / TanStack Query hooks / Inertia helpers in
your frontend.

It injects the routes directly, so it works even when you mount the library's
`createNotificationsController` **factory** (which static AST discovery can't see).

```bash
pnpm add -D @dudousxd/nestjs-notifications-codegen
```

```ts title="nestjs-codegen.config.ts"
import { defineConfig } from '@dudousxd/nestjs-codegen';
import { zodAdapter } from '@dudousxd/nestjs-codegen-zod';
import { nestjsNotificationsCodegen } from '@dudousxd/nestjs-notifications-codegen';

export default defineConfig({
  validation: zodAdapter,
  extensions: [
    nestjsNotificationsCodegen({ basePath: '/api', preferences: true }),
    // ...other extensions (tanstack, inertia, filter)
  ],
});
```

Generates `api.notifications.list()`, `.unread()`, `.unreadCount()`, `.markAsRead({ params })`,
`.markAllAsRead()`, `.remove({ params })` (and `api.notifications.preferences.*` when `preferences`
is on).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `basePath` | `''` | Path prefix the controllers are mounted under (e.g. `'/api'`). |
| `name` | `'notifications'` | Route-name namespace (`api.<name>.list`). |
| `inbox` | `true` | Emit the inbox routes. |
| `preferences` | `false` | Emit the preference-center routes. |

> If you expose your **own** static, decorated notification controllers, codegen already discovers
> them — don't add this extension too, or the routes will be duplicated.
