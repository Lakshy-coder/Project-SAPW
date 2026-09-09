"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandboxRouter = void 0;
const express_1 = require("express");
const SandboxService_1 = require("../sandbox/SandboxService");
const router = (0, express_1.Router)();
exports.sandboxRouter = router;
// POST /api/sandbox/execute
router.post('/execute', async (req, res) => {
    try {
        const { code, allowedLibraries } = req.body;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'INPUT_ERROR: code (string) required' });
        }
        const result = await SandboxService_1.sandboxService.execute(code, allowedLibraries ?? []);
        return res.json(result);
    }
    catch (err) {
        const statusCode = err.message.startsWith('SECURITY_ERROR') ? 403 : 500;
        return res.status(statusCode).json({ error: err.message });
    }
});
// GET /api/sandbox/status
router.get('/status', async (_req, res) => {
    const available = await SandboxService_1.sandboxService.isDockerAvailable();
    return res.json({
        sandboxAvailable: available,
        backend: available ? 'docker-network-none' : 'UNAVAILABLE',
        message: available
            ? 'Secure sandbox active. Executions run in isolated Docker containers with network-none.'
            : 'Docker is not installed or not accessible. Code execution is disabled.'
    });
});
