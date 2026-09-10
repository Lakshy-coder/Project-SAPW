import { Capability } from '@sih2k26/core';

export interface ModelProvider {
  id: string;
  name: string;
  capabilities: Capability[];
  isAvailable(): Promise<boolean>;
  execute(prompt: string, capabilities: Capability[]): Promise<string>;
}

export class CapabilityRegistry {
  private providers: ModelProvider[] = [];

  register(provider: ModelProvider) {
    this.providers.push(provider);
  }

  getProvidersFor(capability: Capability): ModelProvider[] {
    return this.providers.filter(p => p.capabilities.includes(capability));
  }

  getAllProviders(): ModelProvider[] {
    return this.providers;
  }
}

export const capabilityRegistry = new CapabilityRegistry();
