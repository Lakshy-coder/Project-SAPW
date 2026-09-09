"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolsRouter = void 0;
const express_1 = require("express");
const ToolGateway_1 = require("../tools/ToolGateway");
const ToolRegistry_1 = require("../tools/ToolRegistry");
const router = (0, express_1.Router)();
exports.toolsRouter = router;
// GET /api/tools  – list registered tools
router.get('/', (_req, res) => {
    const tools = ToolRegistry_1.toolRegistry.listTools().map(t => ({
        id: t.id,
        version: t.version,
        name: t.name,
        description: t.description,
        capabilityClass: t.capabilityClass,
        riskLevel: t.riskLevel,
        requiredPermissions: t.requiredPermissions
    }));
    return res.json({ tools });
});
// POST /api/tools/:toolId/execute
router.post('/:toolId/execute', async (req, res) => {
    try {
        const { toolId } = req.params;
        const { input } = req.body;
        // In production: extract real permissions from auth middleware
        const userPermissions = req.userPermissions ?? ['tools:engineering', 'tools:knowledge'];
        const { result, record } = await ToolGateway_1.toolGateway.execute(toolId, input, userPermissions);
        return res.json({ result, record });
    }
    catch (err) {
        const statusCode = err.message.startsWith('AUTH_ERROR') ? 403
            : err.message.startsWith('INPUT_ERROR') ? 400
                : err.message.startsWith('TOOL_NOT_FOUND') ? 404
                    : 500;
        return res.status(statusCode).json({ error: err.message });
    }
});
