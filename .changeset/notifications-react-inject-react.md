---
"@dudousxd/nestjs-notifications-react": patch
---

Fix "React is not defined" in the built bundle. tsup/esbuild compiled the package's JSX with the classic runtime (`React.createElement`) but never imported React, so consuming it from a modern automatic-runtime app bundle threw `React is not defined` at module load. Inject a React shim at build time so every `React` reference resolves to an import from the (peer) `react`, making the output self-contained.
