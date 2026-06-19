import { type DynamicModule, Inject, Injectable, Module, type Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { defineChannelModule } from './define-channel-module';

const OPTIONS = Symbol('FAKE_OPTIONS');
const RESOLVER = Symbol('FAKE_RESOLVER');

@Injectable()
class FakeChannel {
  constructor(@Inject(OPTIONS) readonly options: unknown) {}
}

@Module({})
class FakeChannelModule {
  static forRoot(
    opts: { url?: string; resolveOptions?: unknown; global?: boolean; withResolver?: boolean } = {},
  ): DynamicModule {
    return defineChannelModule({
      module: FakeChannelModule,
      channel: FakeChannel,
      optionsToken: OPTIONS,
      options: opts.url !== undefined ? { url: opts.url } : {},
      ...(opts.withResolver !== false
        ? { resolver: { token: RESOLVER, value: opts.resolveOptions } }
        : {}),
      ...(opts.global !== undefined ? { global: opts.global } : {}),
    });
  }
}

/** Find the `useValue` of a value-provider for `token` in a providers array. */
function useValueOf(providers: Provider[] | undefined, token: symbol): unknown {
  const p = (providers ?? []).find(
    (x): x is { provide: symbol; useValue: unknown } =>
      typeof x === 'object' && 'provide' in x && x.provide === token,
  );
  return p?.useValue;
}

describe('defineChannelModule', () => {
  it('builds a global-by-default module that exports the channel', () => {
    const mod = FakeChannelModule.forRoot({ url: 'https://x' });
    expect(mod.module).toBe(FakeChannelModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual([FakeChannel]);
    expect(mod.providers).toContain(FakeChannel);
    expect(useValueOf(mod.providers, OPTIONS)).toEqual({ url: 'https://x' });
  });

  it('honors an explicit global:false', () => {
    expect(FakeChannelModule.forRoot({ global: false }).global).toBe(false);
  });

  it('registers the resolver token, defaulting an absent value to null', () => {
    expect(useValueOf(FakeChannelModule.forRoot({}).providers, RESOLVER)).toBeNull();
    const fn = () => ({});
    expect(useValueOf(FakeChannelModule.forRoot({ resolveOptions: fn }).providers, RESOLVER)).toBe(
      fn,
    );
  });

  it('omits the resolver provider entirely when no resolver is configured', () => {
    const providers = FakeChannelModule.forRoot({ withResolver: false }).providers ?? [];
    const hasResolver = providers.some(
      (x) => typeof x === 'object' && 'provide' in x && x.provide === RESOLVER,
    );
    expect(hasResolver).toBe(false);
  });

  it('wires the channel + options through real DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeChannelModule.forRoot({ url: 'https://hook' })],
    }).compile();
    expect(moduleRef.get(FakeChannel).options).toEqual({ url: 'https://hook' });
    expect(moduleRef.get<unknown>(RESOLVER)).toBeNull();
  });
});
