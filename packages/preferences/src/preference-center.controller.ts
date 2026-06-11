import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Body, Controller, Get, Param, Put, Req, type Type } from '@nestjs/common';
import type {
  CategoryDefinition,
  DigestFrequency,
  PreferenceMatrix,
} from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';

/** Options for {@link createPreferenceCenterController}. */
export interface PreferenceCenterControllerOptions {
  /**
   * Resolves the current notifiable from the request (e.g. from `req.user`). May be async.
   * The returned ref scopes every read/write to that notifiable.
   */
  resolveRef: (req: any) => NotifiableRef | Promise<NotifiableRef>;
  /** Optional resolver for the tenant scope (multi-tenant apps). May be async. */
  resolveTenant?: (req: any) => string | undefined | Promise<string | undefined>;
}

/** Body of `PUT /preferences/:category/channels/:channel`. */
interface SetChannelBody {
  enabled: boolean;
}

/** Body of `PUT /preferences/:category/digest`. */
interface SetDigestBody {
  digest: DigestFrequency;
}

/**
 * Builds a `@Controller('preferences')` exposing the preference-center backend that a UI (e.g.
 * the React package) consumes:
 *
 * - `GET /preferences/categories` — the configured category definitions
 * - `GET /preferences` — the resolved matrix for the current notifiable
 * - `PUT /preferences/:category/channels/:channel` — body `{ enabled: boolean }`
 * - `PUT /preferences/:category/digest` — body `{ digest: DigestFrequency }`
 *
 * Mount it by adding the returned class to a module's `controllers`, alongside
 * `PreferencesModule.forCenter(...)` (which provides {@link PreferenceCenterService}):
 *
 * ```ts
 * const PreferenceCenterController = createPreferenceCenterController({
 *   resolveRef: (req) => ({ type: 'User', id: req.user.id }),
 * });
 * ```
 */
export function createPreferenceCenterController(
  options: PreferenceCenterControllerOptions,
): Type<unknown> {
  @Controller('preferences')
  class PreferenceCenterController {
    constructor(private readonly preferences: PreferenceCenterService) {}

    @Get('categories')
    categories(): CategoryDefinition[] {
      return this.preferences.listCategories();
    }

    @Get()
    async matrix(@Req() req: any): Promise<PreferenceMatrix> {
      const ref = await options.resolveRef(req);
      const tenantId = await options.resolveTenant?.(req);
      return this.preferences.getMatrix(ref, tenantId);
    }

    @Put(':category/channels/:channel')
    async setChannel(
      @Req() req: any,
      @Param('category') category: string,
      @Param('channel') channel: string,
      @Body() body: SetChannelBody,
    ): Promise<PreferenceMatrix> {
      const ref = await options.resolveRef(req);
      const tenantId = await options.resolveTenant?.(req);
      await this.preferences.setChannel(ref, category, channel, body.enabled, tenantId);
      return this.preferences.getMatrix(ref, tenantId);
    }

    @Put(':category/digest')
    async setDigest(
      @Req() req: any,
      @Param('category') category: string,
      @Body() body: SetDigestBody,
    ): Promise<PreferenceMatrix> {
      const ref = await options.resolveRef(req);
      const tenantId = await options.resolveTenant?.(req);
      await this.preferences.setDigest(ref, category, body.digest, tenantId);
      return this.preferences.getMatrix(ref, tenantId);
    }
  }

  return PreferenceCenterController;
}
