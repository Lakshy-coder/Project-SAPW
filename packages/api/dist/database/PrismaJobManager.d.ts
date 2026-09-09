import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
export declare function checkDatabaseConnection(): Promise<boolean>;
export declare class PrismaJobManager {
    static createJob(request: JobRequest, userId: string, projectId: string): Promise<{
        id: any;
        projectId: any;
        userId: any;
        workflowVersion: any;
        status: JobStatus;
        createdAt: any;
        updatedAt: any;
        request: any;
        nodes: any;
    }>;
    static getJob(jobId: string): Promise<{
        id: any;
        projectId: any;
        userId: any;
        workflowVersion: any;
        status: JobStatus;
        createdAt: any;
        updatedAt: any;
        request: any;
        nodes: any;
    } | undefined>;
    static updateJobStatus(jobId: string, status: JobStatus): Promise<{
        id: any;
        projectId: any;
        userId: any;
        workflowVersion: any;
        status: JobStatus;
        createdAt: any;
        updatedAt: any;
        request: any;
        nodes: any;
    }>;
    static updateJobNodes(jobId: string, nodes: ExecutionNode[]): Promise<{
        id: any;
        projectId: any;
        userId: any;
        workflowVersion: any;
        status: JobStatus;
        createdAt: any;
        updatedAt: any;
        request: any;
        nodes: any;
    } | undefined>;
    static updateNodeState(jobId: string, nodeId: string, state: ExecutionNode['state']): Promise<{
        id: any;
        projectId: any;
        userId: any;
        workflowVersion: any;
        status: JobStatus;
        createdAt: any;
        updatedAt: any;
        request: any;
        nodes: any;
    } | undefined>;
    private static toJobRecord;
    static close(): Promise<void>;
}
