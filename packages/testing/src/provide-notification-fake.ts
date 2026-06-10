import { NotificationService } from '@dudousxd/nestjs-notifications-core';
import type { Provider } from '@nestjs/common';
import { NotificationFake } from './notification-fake';

/**
 * A Nest provider that swaps the real `NotificationService` for {@link NotificationFake}.
 *
 * ```ts
 * const moduleRef = await Test.createTestingModule({
 *   providers: [provideNotificationFake()],
 * }).compile();
 * const fake = moduleRef.get(NotificationService) as unknown as NotificationFake;
 * ```
 *
 * Or override an existing provider:
 *
 * ```ts
 * .overrideProvider(NotificationService).useClass(NotificationFake)
 * ```
 */
export function provideNotificationFake(): Provider {
  return { provide: NotificationService, useClass: NotificationFake };
}
