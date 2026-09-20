import { Router, Request, Response } from 'express';
import { toolGateway } from '../tools/ToolGateway';
import { toolRegistry } from '../tools/ToolRegistry';

const router = Router();

// GET /api/tools  – list registered tools
router.get('/', (_req: Request, res: Response) => {
  const tools = toolRegistry.listTools().map(t => ({
    id: t.id,
    version: t.version,
    name: t.name,
    description: t.description,
    capabilityClass: t.capabilityClass,
    riskLevel: t.riskLevel,
    requiredPermissions: t.requiredPermissions
  }));
  return res.json({ tools });
});

// POST /api/tools/:toolId/execute
router.post('/:toolId/execute', async (req: Request, res: Response) => {
  try {
    const { toolId } = req.params;
    const { input } = req.body;
    // In production: extract real permissions from auth middleware
    const userPermissions = (req as any).userPermissions ?? ['tools:engineering', 'tools:knowledge'];
    const { result, record } = await toolGateway.execute(toolId, input, userPermissions);
    return res.json({ result, record });
  } catch (err: any) {
    const statusCode = err.message.startsWith('AUTH_ERROR') ? 403
      : err.message.startsWith('INPUT_ERROR') ? 400
      : err.message.startsWith('TOOL_NOT_FOUND') ? 404
      : 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

export { router as toolsRouter };
