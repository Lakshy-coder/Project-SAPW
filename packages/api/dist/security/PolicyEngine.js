"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policyEngine = exports.PolicyEngine = void 0;
class PolicyEngine {
    static evaluateJob(request, context = {}) {
        const reasons = [];
        const userPermissions = context.userPermissions ?? [];
        const risk = request.riskLevel ?? 'LOW';
        const sovereignMode = context.sovereignMode ?? process.env.SOVEREIGN_MODE === 'true';
        const requiredCapabilities = context.requiredCapabilities ?? request.capabilities ?? [];
        if (requiredCapabilities.length === 0) {
            reasons.push('No capabilities declared for request');
        }
        if (request.riskLevel === 'HIGH' || request.riskLevel === 'CRITICAL') {
            if (!userPermissions.includes('jobs:high-risk')) {
                reasons.push('High-risk job requires explicit permission');
            }
        }
        if (context.sandboxAvailable === false && requiredCapabilities.includes('CODE_EXECUTION')) {
            if (sovereignMode || process.env.NODE_ENV === 'production') {
                reasons.push('Code execution requires a working sandbox in production/sovereign mode');
            }
        }
        if (context.demoMode && !context.allowFastFallback) {
            reasons.push('Explicit demo mode is disabled for production execution paths');
        }
        const endpoint = (context.modelEndpoint ?? process.env.OLLAMA_BASE_URL ?? '').toLowerCase();
        if (sovereignMode && endpoint && !endpoint.includes('localhost') && !endpoint.includes('127.0.0.1') && !endpoint.includes('10.') && !endpoint.includes('192.168.') && !endpoint.includes('172.')) {
            reasons.push('Sovereign mode rejects non-local model endpoints');
        }
        if (context.executionEnvironment === 'PUBLIC' && sovereignMode) {
            reasons.push('Public execution environment is not allowed in sovereign mode');
        }
        const sensitive = context.inputSensitivity ?? 'INTERNAL';
        if (sensitive === 'RESTRICTED' && !userPermissions.includes('data:restricted')) {
            reasons.push('Restricted input requires elevated access');
        }
        const allowed = reasons.length === 0;
        return {
            allowed,
            status: allowed ? 'ALLOW' : 'DENY',
            reasons,
            risk
        };
    }
    static evaluateTool(toolId, requiredPermissions, userPermissions, toolRisk = 'LOW', context = {}) {
        const reasons = [];
        const missing = requiredPermissions.filter(p => !userPermissions.includes(p));
        if (missing.length > 0) {
            reasons.push(`Missing permissions for ${toolId}: ${missing.join(', ')}`);
        }
        if (toolRisk === 'CRITICAL' && !userPermissions.includes('tools:critical')) {
            reasons.push(`Critical tool ${toolId} requires elevated authorization`);
        }
        if (toolRisk === 'HIGH' && !userPermissions.includes('tools:high-risk')) {
            reasons.push(`High-risk tool ${toolId} requires approval`);
        }
        if (context.sovereignMode && (context.executionEnvironment === 'PUBLIC' || !context.sandboxAvailable)) {
            reasons.push('Sovereign execution requires private environment and safe sandboxing');
        }
        return {
            allowed: reasons.length === 0,
            status: reasons.length === 0 ? 'ALLOW' : 'DENY',
            reasons,
            risk: toolRisk
        };
    }
}
exports.PolicyEngine = PolicyEngine;
exports.policyEngine = PolicyEngine;
