"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySchema = verifySchema;
exports.verifyHash = verifyHash;
exports.verifyMath = verifyMath;
exports.verificationGate = verificationGate;
const crypto_1 = require("crypto");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
// ─── Schema Verifier ──────────────────────────────────────────────────────────
function verifySchema(data, schema) {
    const result = schema.safeParse(data);
    return {
        verifierId: 'schema-verifier',
        type: 'SCHEMA',
        status: result.success ? 'PASS' : 'FAIL',
        evidence: result.success ? null : result.error.issues,
        failureReason: result.success ? undefined : 'Schema validation failed',
        version: '1.0.0'
    };
}
// ─── Provenance / Hash Verifier ───────────────────────────────────────────────
function verifyHash(content, expectedHash) {
    const actual = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
    const pass = actual === expectedHash;
    return {
        verifierId: 'hash-verifier',
        type: 'PROVENANCE',
        status: pass ? 'PASS' : 'FAIL',
        evidence: { expected: expectedHash, actual },
        failureReason: pass ? undefined : `Hash mismatch: expected ${expectedHash}, got ${actual}`,
        version: '1.0.0'
    };
}
function verifyMath(input) {
    const { computed, expected, tolerancePct = 1 } = input;
    const pctDiff = Math.abs((computed - expected) / expected) * 100;
    const pass = pctDiff <= tolerancePct;
    return {
        verifierId: 'math-verifier',
        type: 'MATH',
        status: pass ? 'PASS' : 'FAIL',
        evidence: { computed, expected, tolerancePct, actualDiffPct: pctDiff },
        failureReason: pass ? undefined : `Math deviation ${pctDiff.toFixed(2)}% exceeds tolerance ${tolerancePct}%`,
        version: '1.0.0'
    };
}
// ─── Verification Gate ─────────────────────────────────────────────────────────
// This is the architectural gate: ALL results must pass before being finalized.
function verificationGate(results) {
    const failed = results.filter(r => r.status !== 'PASS');
    const hasBlock = failed.some(r => r.type === 'PROVENANCE' || r.type === 'POLICY');
    return {
        canProceed: failed.length === 0,
        verdict: failed.length === 0 ? 'PASS' : hasBlock ? 'BLOCKED' : 'FAIL',
        failedChecks: failed
    };
}
