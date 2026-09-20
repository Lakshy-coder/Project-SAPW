import { z, ZodSchema } from 'zod';

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

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const toolRegistry = new ToolRegistry();
