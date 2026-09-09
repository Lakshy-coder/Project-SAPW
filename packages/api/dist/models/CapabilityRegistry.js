"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilityRegistry = exports.CapabilityRegistry = void 0;
class CapabilityRegistry {
    providers = [];
    register(provider) {
        this.providers.push(provider);
    }
    getProvidersFor(capability) {
        return this.providers.filter(p => p.capabilities.includes(capability));
    }
    getAllProviders() {
        return this.providers;
    }
}
exports.CapabilityRegistry = CapabilityRegistry;
exports.capabilityRegistry = new CapabilityRegistry();
