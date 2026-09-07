import { Capability } from '@sih2k26/core';
import { capabilityRegistry, ModelProvider } from './CapabilityRegistry';

export class ModelRouter {
  static async route(capability: Capability, prompt: string): Promise<string> {
    const providers = capabilityRegistry.getProvidersFor(capability);
    
    if (providers.length === 0) {
      throw new Error(`MODEL_UNAVAILABLE: No providers registered for capability ${capability}`);
    }

    // Try providers in order until one is available and succeeds
    for (const provider of providers) {
      const available = await provider.isAvailable();
      if (available) {
        try {
          return await provider.execute(prompt, [capability]);
        } catch (err) {
          // Log and try next provider
          console.warn(`Provider ${provider.id} failed, trying next...`, err);
        }
      }
    }

    throw new Error(`MODEL_UNAVAILABLE: All providers for capability ${capability} are offline or failed.`);
  }
}
