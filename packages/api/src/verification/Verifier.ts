import { createHash } from 'crypto';
import pino from 'pino';

const logger = pino();

export type VerificationStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NEEDS_REVIEW';

export interface VerificationResult {
  verifierId: string;
  type: 'SCHEMA' | 'MATH' | 'POLICY' | 'PROVENANCE' | 'INTEGRITY';
  status: VerificationStatus;
  evidence: any;
  failureReason?: string;
  version: string;
}

// ─── Schema Verifier ──────────────────────────────────────────────────────────
export function verifySchema(data: any, schema: any): VerificationResult {
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
export function verifyHash(content: string | Buffer, expectedHash: string): VerificationResult {
  const actual = createHash('sha256').update(content).digest('hex');
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

// ─── Math / Engineering Verifier ──────────────────────────────────────────────
export interface MathVerificationInput {
  computed: number;
  expected: number;
  tolerancePct?: number;
}

export function verifyMath(input: MathVerificationInput): VerificationResult {
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
export function verificationGate(results: VerificationResult[]): {
  canProceed: boolean;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  failedChecks: VerificationResult[];
} {
  const failed = results.filter(r => r.status !== 'PASS');
  const hasBlock = failed.some(r => r.type === 'PROVENANCE' || r.type === 'POLICY');
  return {
    canProceed: failed.length === 0,
    verdict: failed.length === 0 ? 'PASS' : hasBlock ? 'BLOCKED' : 'FAIL',
    failedChecks: failed
  };
}
