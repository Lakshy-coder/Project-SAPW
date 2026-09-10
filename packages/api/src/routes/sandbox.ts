import { Router, Request, Response } from 'express';
import { sandboxService } from '../sandbox/SandboxService';

const router = Router();

// POST /api/sandbox/execute
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { code, allowedLibraries } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'INPUT_ERROR: code (string) required' });
    }
    const result = await sandboxService.execute(code, allowedLibraries ?? []);
    return res.json(result);
  } catch (err: any) {
    const statusCode = err.message.startsWith('SECURITY_ERROR') ? 403 : 500;
    return res.status(statusCode).json({ error: err.message });
  }
});

// GET /api/sandbox/status
router.get('/status', async (_req: Request, res: Response) => {
  const available = await sandboxService.isDockerAvailable();
  return res.json({
    sandboxAvailable: available,
    backend: available ? 'docker-network-none' : 'UNAVAILABLE',
    message: available
      ? 'Secure sandbox active. Executions run in isolated Docker containers with network-none.'
      : 'Docker is not installed or not accessible. Code execution is disabled.'
  });
});

export { router as sandboxRouter };
