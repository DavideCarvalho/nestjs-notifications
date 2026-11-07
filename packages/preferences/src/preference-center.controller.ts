import type { NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Body, Controller, Delete, Get, Param, Put, Req, type Type } from '@nestjs/common';
import { finishController } from './controller-decorators';
import type {
  CategoryDefinition,
  DigestFrequency,
  PreferenceMatrix,
  QuietHours,
} from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';

/** Options for {@link createPreferenceCenterController}. */
export interface PreferenceCenterControllerOptions {
  /**
   * Resolves the current notifiable from the request (e.g. from `req.user`). May be async.
   * The returned ref scopes every read/write to that notifiable; throw (e.g.
   * `UnauthorizedException`) when the request carries no identity.
   */
  resolveRef: (req: any) => NotifiableRef | Promise<NotifiableRef>;
  /** Optional resolver for the tenant scope (multi-tenant apps). May be async. */
  resolveTenant?: (req: any) => string | undefined | Promise<string | undefined>;
  /** Controller base path. Default `'preferences'`. */
  path?: string;
  /**
   * Class decorators applied to the controller, in order, after its own — how you decide who
   * reaches it (e.g.
   * `[UseGuards(AuthenticationGuard), Can(InboxPolicy, 'read')]` with `@nestjs/authorization`).
   * The controller is marked open to `@nestjs/authorization`'s deny-by-default guard
   * (`Can.Anyone()`), so it answers without any; a `@Can()` passed here is still enforced.
   */
  decorators?: ClassDecorator[];
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
 * - `PUT /preferences/quiet-hours` — body {@link QuietHours} (set the do-not-disturb window)
 * - `DELETE /preferences/quiet-hours` — clear the window
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
  @Controller(options.path ?? 'preferences')
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

    @Put('quiet-hours')
    async setQuietHours(@Req() req: any, @Body() body: QuietHours): Promise<PreferenceMatrix> {
      const ref = await options.resolveRef(req);
      const tenantId = await options.resolveTenant?.(req);
      await this.preferences.setQuietHours(ref, body, tenantId);
      return this.preferences.getMatrix(ref, tenantId);
    }

    @Delete('quiet-hours')
    async clearQuietHours(@Req() req: any): Promise<PreferenceMatrix> {
      const ref = await options.resolveRef(req);
      const tenantId = await options.resolveTenant?.(req);
      await this.preferences.setQuietHours(ref, null, tenantId);
      return this.preferences.getMatrix(ref, tenantId);
    }
  }

  finishController(PreferenceCenterController, options.decorators);

  return PreferenceCenterController;
}
