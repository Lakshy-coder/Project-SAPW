import { Capability } from '@sih2k26/core';
import { capabilityRegistry, ModelProvider } from './CapabilityRegistry';

export class ModelRouter {
  static async route(capability: Capability, prompt: string, options?: { signal?: AbortSignal }): Promise<string> {
    const providers = capabilityRegistry.getProvidersFor(capability);
    
    if (providers.length === 0) {
      throw new Error(`MODEL_UNAVAILABLE: No providers registered for capability ${capability}`);
    }

    if (options?.signal?.aborted) {
      throw new Error('MODEL_CANCELLED: Route cancelled before execution');
    }

    // Try providers in order until one is available and succeeds
    for (const provider of providers) {
      const available = await provider.isAvailable();
      if (available) {
        try {
          return await provider.execute(prompt, [capability], options);
        } catch (err: any) {
          if (err.message && err.message.includes('CANCELLED')) {
            throw err; // Do not fallback if explicitly cancelled
          }
          // Log and try next provider
          console.warn(`Provider ${provider.id} failed, trying next...`, err);
        }
      }
    }

    throw new Error(`MODEL_UNAVAILABLE: All providers for capability ${capability} are offline or failed.`);
  }
}
