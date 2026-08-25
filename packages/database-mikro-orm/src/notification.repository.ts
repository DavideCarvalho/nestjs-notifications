import { EntityRepository } from '@mikro-orm/core';
import type { NotificationEntity } from './notification.entity';

/**
 * Injectable repository for the `notifications` table.
 *
 * The class is its own DI token: the entity declares `repository: () => NotificationRepository`, and
 * `MikroOrmModule.forFeature([NotificationEntity])` reads that off the metadata and registers the
 * class as a provider. Consumers inject `NotificationRepository` instead of passing the entity to
 * `em.find()`.
 *
 * The entity is imported as a TYPE only — the entity module value-imports this one for its
 * `repository` thunk, so a value import back would close a runtime module cycle.
 */
export class NotificationRepository extends EntityRepository<NotificationEntity> {}
