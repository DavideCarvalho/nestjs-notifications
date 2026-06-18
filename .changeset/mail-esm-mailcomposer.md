---
"@dudousxd/nestjs-notifications-mail": patch
---

fix: import `nodemailer/lib/mail-composer` with an explicit `/index.js` so it resolves under Node's ESM loader. Directory imports (without the filename) are rejected by the ESM resolver — this only worked under the CJS build, and broke consumers running the package as ESM (e.g. under Vitest).
