"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilitySelector = void 0;
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
/**
 * CapabilitySelector analyzes a job request and selects appropriate capabilities
 * from the set that are actually implemented in this repository.
 *
 * IMPLEMENTED CAPABILITIES:
 * - GENERAL_REASONING: local model reasoning (Ollama)
 * - CODE_EXECUTION: docker-based sandboxed execution
 * - ASME_CALCULATION: deterministic engineering calculations
 * - POLICY_CHECK: security/policy enforcement
 * - SOP_RETRIEVAL: knowledge base retrieval (BM25)
 * - SIGNED_AUDIT: execution provenance and signing
 *
 * NOT FULLY IMPLEMENTED IN THIS BUILD:
 * - CODE_GENERATION: no code generation executor wired
 * - VISION_EXTRACTION: no vision model configured
 * - EMBEDDINGS: vector retrieval infrastructure not active
 * - DOCUMENT_GENERATION: limited artifact support
 */
class CapabilitySelector {
    static selectCapabilities(request) {
        logger.info({ intent: request.intent }, 'Analyzing task for capability selection');
        const scores = [];
        const intentLower = request.intent.toLowerCase();
        // ─── Detect engineering/calculation requests ────────────────────────────────────
        if (this.matchesPattern(intentLower, [
            'pipe', 'thickness', 'pressure', 'stress', 'asme', 'b31.3',
            'wall', 'diameter', 'calculation', 'engineering', 'formula',
            'design', 'verify', 'check'
        ])) {
            scores.push({
                capability: 'ASME_CALCULATION',
                score: 0.95,
                reasoning: 'Task mentions engineering calculation/verification'
            });
            scores.push({
                capability: 'SOP_RETRIEVAL',
                score: 0.80,
                reasoning: 'Engineering task may require standards/documentation'
            });
        }
        // ─── Detect code execution requests ──────────────────────────────────────────────
        if (this.matchesPattern(intentLower, [
            'run', 'execute', 'code', 'script', 'python', 'computation',
            'compute', 'calculate', 'analysis'
        ])) {
            scores.push({
                capability: 'CODE_EXECUTION',
                score: 0.85,
                reasoning: 'Task requires code execution/computation'
            });
        }
        // ─── Detect document/retrieval requests ──────────────────────────────────────────
        if (this.matchesPattern(intentLower, [
            'retrieve', 'find', 'search', 'sop', 'standard', 'procedure',
            'document', 'knowledge', 'reference'
        ])) {
            scores.push({
                capability: 'SOP_RETRIEVAL',
                score: 0.90,
                reasoning: 'Task requires retrieval of documentation or SOPs'
            });
        }
        // ─── Policy/security checks ──────────────────────────────────────────────────────
        if (this.matchesPattern(intentLower, [
            'policy', 'check', 'security', 'compliance', 'audit',
            'approve', 'verify', 'validate'
        ])) {
            scores.push({
                capability: 'POLICY_CHECK',
                score: 0.80,
                reasoning: 'Task involves policy verification or compliance'
            });
        }
        // ─── Always include general reasoning as fallback ────────────────────────────────
        scores.push({
            capability: 'GENERAL_REASONING',
            score: 0.50,
            reasoning: 'Fallback for general task understanding'
        });
        // ─── Always include audit ───────────────────────────────────────────────────────
        scores.push({
            capability: 'SIGNED_AUDIT',
            score: 0.90,
            reasoning: 'Required for execution provenance'
        });
        // Sort by score and select top capabilities
        const sorted = scores.sort((a, b) => b.score - a.score);
        const selected = sorted
            .filter((s) => s.score > 0.49) // Only score > 0.49
            .map((s) => s.capability)
            .filter((cap, idx, arr) => arr.indexOf(cap) === idx); // Deduplicate
        // Ensure GENERAL_REASONING is always included (as fallback)
        if (!selected.includes('GENERAL_REASONING')) {
            selected.push('GENERAL_REASONING');
        }
        logger.info({
            intent: request.intent,
            selectedCapabilities: selected,
            scores: sorted.map(s => ({ capability: s.capability, score: s.score, reasoning: s.reasoning }))
        }, 'Capability selection complete');
        return selected;
    }
    static matchesPattern(text, keywords) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
}
exports.CapabilitySelector = CapabilitySelector;
