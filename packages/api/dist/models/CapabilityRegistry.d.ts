import { Capability } from '@sih2k26/core';
export interface ModelProvider {
    id: string;
    name: string;
    capabilities: Capability[];
    isAvailable(): Promise<boolean>;
    execute(prompt: string, capabilities: Capability[]): Promise<string>;
}
export declare class CapabilityRegistry {
    private providers;
    register(provider: ModelProvider): void;
    getProvidersFor(capability: Capability): ModelProvider[];
    getAllProviders(): ModelProvider[];
}
export declare const capabilityRegistry: CapabilityRegistry;
