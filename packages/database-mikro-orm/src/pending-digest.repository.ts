import { EntityRepository } from '@mikro-orm/core';
import type { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';

/**
 * Injectable repository for the `notification_pending_digests` table.
 *
 * The class is its own DI token: the entity declares `repository: () => PendingDigestRepository`,
 * and `MikroOrmModule.forFeature([...])` reads that off the metadata and registers the class as a
 * provider.
 *
 * The entities are imported as TYPES only — the entity module value-imports this one for its
 * `repository` thunks, so a value import back would close a runtime module cycle.
 */
export class PendingDigestRepository extends EntityRepository<PendingDigestEntity> {}

/** Injectable repository for the `notification_digest_windows` table. Registered the same way. */
export class DigestWindowRepository extends EntityRepository<DigestWindowEntity> {}
