/**
 * esbuild `inject` shim. tsup/esbuild compiles our JSX with the CLASSIC runtime (`React.createElement`)
 * and overrides the `jsx` esbuild option after `esbuildOptions`, so we can't switch to the automatic
 * runtime from the build config. Injecting this shim makes `React` a real binding in every module that
 * references it, so the published bundle is self-contained (imports React from the peer dep) instead of
 * relying on a `React` global — which is undefined in a modern automatic-runtime consumer bundle and
 * caused "React is not defined" at module load.
 */
import * as React from 'react';

export { React };
