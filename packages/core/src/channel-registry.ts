import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { ChannelDriver } from './interfaces';

/**
 * Discovers every {@link ChannelDriver} registered in the Nest container, regardless of
 * which module provided it. Channel packages just expose their driver as a provider —
 * no explicit registration array is needed.
 */
@Injectable()
export class ChannelRegistry implements OnModuleInit {
  private readonly channels = new Map<string, ChannelDriver>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as ChannelDriver | undefined;
      if (instance && typeof instance.channel === 'string' && typeof instance.send === 'function') {
        this.channels.set(instance.channel, instance);
      }
    }
  }

  /** Manually register a channel (used by tests and fakes). */
  register(channel: ChannelDriver): void {
    this.channels.set(channel.channel, channel);
  }

  get(channel: string): ChannelDriver | undefined {
    return this.channels.get(channel);
  }

  has(channel: string): boolean {
    return this.channels.has(channel);
  }

  names(): string[] {
    return [...this.channels.keys()];
  }
}
