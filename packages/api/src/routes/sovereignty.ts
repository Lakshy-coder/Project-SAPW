import { Router, Request, Response } from 'express';
import { networkMonitor } from '../security/NetworkMonitor';

const router = Router();

// GET /api/sovereignty  – live sovereignty status panel
router.get('/', async (_req: Request, res: Response) => {
  const status = networkMonitor.getStatus();
  return res.json(status);
});

// GET /api/sovereignty/connections  – active connections
router.get('/connections', (_req: Request, res: Response) => {
  return res.json({ connections: networkMonitor.getConnections() });
});

// GET /api/sovereignty/violations  – policy violations log
router.get('/violations', (_req: Request, res: Response) => {
  return res.json({ violations: networkMonitor.getViolations() });
});

export { router as sovereigntyRouter };
