---
"@dudousxd/nestjs-notifications-database-drizzle": minor
---

`forRootAsync({ connectionName, useFactory? })` on both Drizzle store modules: the `@nestjs/drizzle` connection name is given statically, and the optional factory resolves `tables`. Returning `db` from that factory as well throws.
