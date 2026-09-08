import { createHash } from 'crypto';
import { toolRegistry, ToolExecutionRecord, ToolDefinition } from './ToolRegistry';
import { policyEngine } from '../security/PolicyEngine';
import pino from 'pino';

const logger = pino();

export class ToolGateway {
  async execute(toolId: string, input: any, _userPermissions: string[]): Promise<{
    result: any;
    record: ToolExecutionRecord;
  }> {
    const tool = toolRegistry.getTool(toolId);
    if (!tool) throw new Error(`TOOL_NOT_FOUND: ${toolId}`);

    const decision = policyEngine.evaluateTool(
      tool.id,
      tool.requiredPermissions,
      _userPermissions,
      tool.riskLevel,
      {
        sovereignMode: process.env.SOVEREIGN_MODE === 'true',
        executionEnvironment: process.env.SOVEREIGN_MODE === 'true' ? 'PRIVATE_LAN' : 'LOCAL',
        sandboxAvailable: process.env.DOCKER_AVAILABLE === 'true'
      }
    );

    if (!decision.allowed) {
      throw new Error(`POLICY_ERROR: ${decision.reasons.join('; ')}`);
    }

    // Input validation
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(`INPUT_ERROR: ${parsed.error.message}`);
    }

    const inputHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
    const start = Date.now();
    let result: any = null;
    let status: 'SUCCESS' | 'FAILED' | 'TIMEOUT' = 'FAILED';
    let error: string | undefined;
    let outputHash: string | null = null;

    try {
      // Timeout wrapper
      result = await Promise.race([
        tool.execute(parsed.data),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TOOL_TIMEOUT')), tool.timeoutMs))
      ]);
      outputHash = createHash('sha256').update(JSON.stringify(result)).digest('hex');
      status = 'SUCCESS';
    } catch (err: any) {
      error = err.message;
      if (err.message === 'TOOL_TIMEOUT') status = 'TIMEOUT';
    }

    const durationMs = Date.now() - start;
    const record: ToolExecutionRecord = { toolId, version: tool.version, inputHash, outputHash, status, durationMs, error };

    logger.info({ record }, 'Tool execution completed');

    if (status !== 'SUCCESS') {
      throw new Error(`TOOL_ERROR: ${toolId} → ${error}`);
    }

    return { result, record };
  }
}

export const toolGateway = new ToolGateway();
