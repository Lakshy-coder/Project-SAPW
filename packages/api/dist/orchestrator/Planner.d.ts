import { JobRequest, ExecutionNode } from '@sih2k26/core';
export declare class Planner {
    static createPlan(jobId: string, request: JobRequest): ExecutionNode[];
}
