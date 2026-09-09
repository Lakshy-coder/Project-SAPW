import { Capability, JobRequest } from '@sih2k26/core';
export type PolicyRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PolicyDecisionStatus = 'ALLOW' | 'DENY';
export interface PolicyContext {
    userPermissions?: string[];
    projectPolicy?: string;
    modelEndpoint?: string;
    executionEnvironment?: 'LOCAL' | 'PRIVATE_LAN' | 'PUBLIC';
    inputSensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
    demoMode?: boolean;
    sovereignMode?: boolean;
    sandboxAvailable?: boolean;
    allowFastFallback?: boolean;
    requiredCapabilities?: Capability[];
    toolRisk?: PolicyRisk;
}
export interface PolicyDecision {
    allowed: boolean;
    status: PolicyDecisionStatus;
    reasons: string[];
    risk: PolicyRisk;
}
export declare class PolicyEngine {
    static evaluateJob(request: JobRequest, context?: PolicyContext): PolicyDecision;
    static evaluateTool(toolId: string, requiredPermissions: string[], userPermissions: string[], toolRisk?: PolicyRisk, context?: PolicyContext): PolicyDecision;
}
export declare const policyEngine: typeof PolicyEngine;
