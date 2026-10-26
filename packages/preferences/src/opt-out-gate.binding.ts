import type {
  ChannelGateContext,
  GateDecision,
  PreferenceGate,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PreferenceCenterGate } from './preference-center.gate';
import { PreferenceGateAdapter } from './preference-gate.adapter';

/**
 * What {@link PreferencesModule.forRoot} binds to the core `NOTIFICATION_PREFERENCE_GATE` token:
 * the opt-out {@link PreferenceGateAdapter}, unless the app also imports
 * {@link PreferencesModule.forCenter}, whose {@link PreferenceCenterGate} then replaces it. Both
 * modules export the token and Nest resolves it from whichever was imported first, so the
 * replacement has to happen here for it not to depend on import order.
 */
@Injectable()
export class OptOutGateBinding implements PreferenceGate {
  private resolved: PreferenceGate | undefined;

  constructor(
    private readonly optOut: PreferenceGateAdapter,
    private readonly moduleRef: ModuleRef,
  ) {}

  isAllowed(context: ChannelGateContext): boolean | Promise<boolean> {
    return this.gate().isAllowed(context);
  }

  async evaluate(context: ChannelGateContext): Promise<GateDecision> {
    const gate = this.gate();
    if (typeof gate.evaluate === 'function') return gate.evaluate(context);
    return { action: (await gate.isAllowed(context)) ? 'allow' : 'skip' };
  }

  private gate(): PreferenceGate {
    if (!this.resolved) {
      let center: PreferenceCenterGate | undefined;
      try {
        center = this.moduleRef.get(PreferenceCenterGate, { strict: false });
      } catch {
        center = undefined;
      }
      this.resolved = center ?? this.optOut;
    }
    return this.resolved;
  }
}
