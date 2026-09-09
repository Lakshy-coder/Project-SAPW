export type VerificationStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NEEDS_REVIEW';
export interface VerificationResult {
    verifierId: string;
    type: 'SCHEMA' | 'MATH' | 'POLICY' | 'PROVENANCE' | 'INTEGRITY';
    status: VerificationStatus;
    evidence: any;
    failureReason?: string;
    version: string;
}
export declare function verifySchema(data: any, schema: any): VerificationResult;
export declare function verifyHash(content: string | Buffer, expectedHash: string): VerificationResult;
export interface MathVerificationInput {
    computed: number;
    expected: number;
    tolerancePct?: number;
}
export declare function verifyMath(input: MathVerificationInput): VerificationResult;
export declare function verificationGate(results: VerificationResult[]): {
    canProceed: boolean;
    verdict: 'PASS' | 'FAIL' | 'BLOCKED';
    failedChecks: VerificationResult[];
};
