import { WebSocketService } from '../services/WebSocketService';
import { JobRequest } from '@sih2k26/core';
export declare class ExecutionGraph {
    private wsService;
    constructor(wsService: WebSocketService);
    /**
     * Creates a job with initial status without waiting for execution.
     * Execution is started asynchronously in the background.
     * Returns the job object with QUEUED status immediately.
     *
     * Capabilities are selected based on the task intent using CapabilitySelector.
     */
    createAndQueueJob(request: JobRequest, userId: string, projectId: string): Promise<{
        id: string;
        projectId: string;
        userId: string;
        workflowVersion: string;
        status: import("@sih2k26/core").JobStatus;
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
        nodes: import("@sih2k26/core").ExecutionNode[];
    }>;
    /**
     * Executes a job in the background.
     * Updates job state, emits events, and handles failures without throwing to caller.
     */
    private executeJobInBackground;
    private executeNode;
}
