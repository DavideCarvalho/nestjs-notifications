import type { Type } from '@nestjs/common';

/**
 * `@nestjs/authorization`'s `CAN_ANYONE_METADATA` — the key `@Can.Anyone()` writes. The package
 * does not export it, and this library does not depend on `@nestjs/authorization`, so it is
 * written here by value.
 */
export const CAN_ANYONE_METADATA = 'authorization:can-anyone';

/**
 * Finishes a controller class this package builds:
 *
 * 1. Marks it open to `@nestjs/authorization`'s deny-by-default `AuthorizationGuard` (the same
 *    metadata `@Can.Anyone()` writes), so an app that registers `AuthorizationModule.forRoot()`
 *    does not refuse these routes just because they declare no `@Can()`. This package's own
 *    protection (`guards`, `resolveRef`, signatures, ...) keeps deciding who reaches them. The mark
 *    only opens routes with no requirement: a `@Can()` passed in `decorators` is still enforced.
 * 2. Applies the caller's `decorators` (e.g. `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]`),
 *    in order, after the class's own decorators.
 *
 * Every factory call builds a fresh class, so decorators applied for one registration never
 * reach another.
 *
 * @internal Not exported from the package entry point.
 */
export function finishController(
  controller: Type<unknown>,
  decorators: readonly ClassDecorator[] | undefined,
): void {
  Reflect.defineMetadata(CAN_ANYONE_METADATA, true, controller);
  for (const decorator of decorators ?? []) {
    decorator(controller);
  }
}
