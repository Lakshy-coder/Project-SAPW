import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
export declare class JobManager {
    static createJob(request: JobRequest, userId: string, projectId: string): Promise<{
        id: string;
        projectId: string;
        userId: string;
        workflowVersion: string;
        status: JobStatus;
        createdAt: Date;
        updatedAt: Date;
        request: {
            capabilities: string[];
            intent: string;
            riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
            id?: string | undefined;
            projectId?: string | undefined;
            userId?: string | undefined;
            sessionId?: string | undefined;
            rawRequest?: any;
            normalizedRequest?: any;
            attachedFileIds?: string[] | undefined;
            contentHashes?: string[] | undefined;
        };
        nodes: ExecutionNode[];
    }>;
    static getJob(jobId: string): Promise<any>;
    static updateJobStatus(jobId: string, status: JobStatus): Promise<any>;
    /**
     * @deprecated Nodes should be set during planning, not added individually.
     * Use updateJobNodes instead to persist the entire nodes array.
     */
    static addNodeToJob(jobId: string, node: ExecutionNode): Promise<void>;
    /**
     * Update the entire nodes array for a job after execution changes.
     * Prevents node duplication by replacing the entire array.
     */
    static updateJobNodes(jobId: string, nodes: ExecutionNode[]): Promise<any>;
    static evaluatePolicy(request: JobRequest, userPermissions?: string[]): Promise<import("../security/PolicyEngine").PolicyDecision>;
    static backendMode(): Promise<"FILE" | "PRISMA">;
}
