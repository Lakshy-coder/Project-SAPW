"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRouter = void 0;
const CapabilityRegistry_1 = require("./CapabilityRegistry");
class ModelRouter {
    static async route(capability, prompt) {
        const providers = CapabilityRegistry_1.capabilityRegistry.getProvidersFor(capability);
        if (providers.length === 0) {
            throw new Error(`MODEL_UNAVAILABLE: No providers registered for capability ${capability}`);
        }
        // Try providers in order until one is available and succeeds
        for (const provider of providers) {
            const available = await provider.isAvailable();
            if (available) {
                try {
                    return await provider.execute(prompt, [capability]);
                }
                catch (err) {
                    // Log and try next provider
                    console.warn(`Provider ${provider.id} failed, trying next...`, err);
                }
            }
        }
        throw new Error(`MODEL_UNAVAILABLE: All providers for capability ${capability} are offline or failed.`);
    }
}
exports.ModelRouter = ModelRouter;
