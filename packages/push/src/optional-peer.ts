/**
 * Lazy loading for the push transports' OPTIONAL peer SDKs (`web-push`, `firebase-admin`,
 * `expo-server-sdk`, `@parse/node-apn`).
 *
 * The transports are re-exported from the package root, so a top-level `import` of their SDK would
 * make `import '@dudousxd/nestjs-notifications-push'` crash for every app that hasn't installed ALL
 * of them — including apps that only use `PushChannel` with their own {@link PushTransport}. Each
 * transport instead loads its SDK on first use through {@link loadOptionalPeer}, which throws a
 * clear "install it" error when the peer is missing.
 */

/** True when `error` is Node's "cannot find this module" (CJS or ESM flavour) for `specifier`. */
function isModuleNotFound(error: unknown, specifier: string): boolean {
  // Walk the `cause` chain: loaders/bundlers may wrap the original resolution error.
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') return false;
    const { code, message, cause } = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const notFound =
      code === 'MODULE_NOT_FOUND' ||
      code === 'ERR_MODULE_NOT_FOUND' ||
      (typeof message === 'string' && /Cannot find (module|package)/i.test(message));
    if (notFound && (typeof message !== 'string' || message.includes(specifier))) return true;
    current = cause;
  }
  return false;
}

/**
 * Pick the usable module object from a dynamic `import()` result: the namespace itself when it
 * carries `probe`, else its (possibly nested) `default` — CJS SDKs surface their exports on
 * `default` when imported from ESM.
 */
function interop<T>(mod: unknown, probe: string): T {
  let current = mod as Record<string, unknown> | undefined;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (read(current, probe) !== undefined) return current as T;
    current = read(current, 'default') as Record<string, unknown> | undefined;
  }
  return mod as T;
}

/** Property read that tolerates namespace proxies throwing on unknown keys (e.g. test mocks). */
function read(obj: Record<string, unknown>, key: string): unknown {
  try {
    return obj[key];
  } catch {
    return undefined;
  }
}

/**
 * Await `load()` (a literal `import('<sdk>')`), normalizing CJS/ESM interop via `probe` (a
 * property the SDK module is known to expose). A missing peer becomes a descriptive error naming
 * the transport and the package to install.
 */
export async function loadOptionalPeer<T>(
  load: () => Promise<unknown>,
  specifier: string,
  transport: string,
  probe: string,
): Promise<T> {
  try {
    return interop<T>(await load(), probe);
  } catch (error) {
    if (isModuleNotFound(error, specifier)) {
      throw new Error(
        `${transport} needs the optional peer dependency "${specifier}". Install it ` +
          `(e.g. \`pnpm add ${specifier}\`), or use another PushTransport.`,
      );
    }
    throw error;
  }
}
