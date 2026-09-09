"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const SandboxService_1 = require("../sandbox/SandboxService");
const VectorSearch_1 = require("../rag/VectorSearch");
const CapabilityRegistry_1 = require("../models/CapabilityRegistry");
const router = (0, express_1.Router)();
exports.healthRouter = router;
router.get('/', async (_req, res) => {
    const modelStatuses = await Promise.all(CapabilityRegistry_1.capabilityRegistry.getAllProviders().map(async (p) => ({
        id: p.id,
        name: p.name,
        capabilities: p.capabilities,
        available: await p.isAvailable()
    })));
    const sandboxAvailable = await SandboxService_1.sandboxService.isDockerAvailable();
    const qdrantAvailable = await VectorSearch_1.vectorSearch.isAvailable();
    const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
    const allModelsUnavailable = modelStatuses.every(m => !m.available);
    return res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        sovereignMode,
        components: {
            api: { status: 'UP' },
            sandbox: { status: sandboxAvailable ? 'UP' : 'UNAVAILABLE', backend: sandboxAvailable ? 'docker-network-none' : 'none' },
            qdrant: { status: qdrantAvailable ? 'UP' : 'UNAVAILABLE' },
            models: modelStatuses,
            modelState: allModelsUnavailable ? 'MODEL_UNAVAILABLE' : 'READY'
        },
        networkPolicy: {
            mode: sovereignMode ? 'SOVEREIGN' : 'DEVELOPMENT',
            publicEndpointsAllowed: !sovereignMode,
            cloudInferenceAllowed: false
        }
    });
});
