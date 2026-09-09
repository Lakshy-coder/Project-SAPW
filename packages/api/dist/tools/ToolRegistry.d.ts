import { ZodSchema } from 'zod';
export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ToolCapabilityClass = 'ENGINEERING' | 'KNOWLEDGE' | 'FILES' | 'COMPUTATION' | 'DELIVERABLES' | 'SYSTEM';
export interface ToolDefinition<TInput = any, TOutput = any> {
    id: string;
    version: string;
    name: string;
    description: string;
    capabilityClass: ToolCapabilityClass;
    riskLevel: ToolRiskLevel;
    timeoutMs: number;
    inputSchema: ZodSchema<TInput>;
    outputSchema: ZodSchema<TOutput>;
    requiredPermissions: string[];
    execute(input: TInput): Promise<TOutput>;
}
export interface ToolExecutionRecord {
    toolId: string;
    version: string;
    inputHash: string;
    outputHash: string | null;
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
    durationMs: number;
    error?: string;
}
export declare class ToolRegistry {
    private tools;
    register(tool: ToolDefinition): void;
    getTool(id: string): ToolDefinition | undefined;
    listTools(): ToolDefinition[];
}
export declare const toolRegistry: ToolRegistry;
