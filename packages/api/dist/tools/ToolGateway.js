"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolGateway = exports.ToolGateway = void 0;
const crypto_1 = require("crypto");
const ToolRegistry_1 = require("./ToolRegistry");
const PolicyEngine_1 = require("../security/PolicyEngine");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class ToolGateway {
    async execute(toolId, input, _userPermissions) {
        const tool = ToolRegistry_1.toolRegistry.getTool(toolId);
        if (!tool)
            throw new Error(`TOOL_NOT_FOUND: ${toolId}`);
        const decision = PolicyEngine_1.policyEngine.evaluateTool(tool.id, tool.requiredPermissions, _userPermissions, tool.riskLevel, {
            sovereignMode: process.env.SOVEREIGN_MODE === 'true',
            executionEnvironment: process.env.SOVEREIGN_MODE === 'true' ? 'PRIVATE_LAN' : 'LOCAL',
            sandboxAvailable: process.env.DOCKER_AVAILABLE === 'true'
        });
        if (!decision.allowed) {
            throw new Error(`POLICY_ERROR: ${decision.reasons.join('; ')}`);
        }
        // Input validation
        const parsed = tool.inputSchema.safeParse(input);
        if (!parsed.success) {
            throw new Error(`INPUT_ERROR: ${parsed.error.message}`);
        }
        const inputHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify(parsed.data)).digest('hex');
        const start = Date.now();
        let result = null;
        let status = 'FAILED';
        let error;
        let outputHash = null;
        try {
            // Timeout wrapper
            result = await Promise.race([
                tool.execute(parsed.data),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TOOL_TIMEOUT')), tool.timeoutMs))
            ]);
            outputHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify(result)).digest('hex');
            status = 'SUCCESS';
        }
        catch (err) {
            error = err.message;
            if (err.message === 'TOOL_TIMEOUT')
                status = 'TIMEOUT';
        }
        const durationMs = Date.now() - start;
        const record = { toolId, version: tool.version, inputHash, outputHash, status, durationMs, error };
        logger.info({ record }, 'Tool execution completed');
        if (status !== 'SUCCESS') {
            throw new Error(`TOOL_ERROR: ${toolId} → ${error}`);
        }
        return { result, record };
    }
}
exports.ToolGateway = ToolGateway;
exports.toolGateway = new ToolGateway();
