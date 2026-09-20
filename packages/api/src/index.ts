import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const loadProjectEnv = () => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), 'packages', 'api', '.env'),
    path.resolve(__dirname, '..', '..', '.env')
  ];

  for (const file of candidates) {
    if (!existsSync(file)) continue;

    const contents = readFileSync(file, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!process.env[key]) process.env[key] = rest.join('=').trim();
    }
    break;
  }
};

loadProjectEnv();

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { WebSocketService } from './services/WebSocketService';
import { auditService } from './audit/AuditService';
import { ExecutionGraph } from './orchestrator/ExecutionGraph';
import { setExecutionGraph } from './orchestrator/ExecutionCoordinator';
import { JobRequestSchema } from '@sih2k26/core';
import { capabilityRegistry } from './models/CapabilityRegistry';
import { ollamaAdapter } from './models/adapters/OllamaAdapter';

// Tools — import to trigger self-registration
import './tools/EngineeringCalculators';

// Routes
import { healthRouter } from './routes/health';
import { knowledgeRouter } from './routes/knowledge';
import { toolsRouter } from './routes/tools';
import { sandboxRouter } from './routes/sandbox';
import { jobsRouter } from './routes/jobs';
import { auditRouter } from './routes/audit';
import { artifactsRouter } from './routes/artifacts';
import { sovereigntyRouter } from './routes/sovereignty';
import { aiRouter } from './routes/ai';
import { authRouter } from './routes/auth';

// Auth middleware
import { requireAuth, requirePermission } from './auth/middleware';

// ─── Model Registration ──────────────────────────────────────────────────────
capabilityRegistry.register(ollamaAdapter);

// ─── Logger ──────────────────────────────────────────────────────────────────
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
});

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health',     healthRouter);
app.use('/api/knowledge',  knowledgeRouter);
app.use('/api/tools',      toolsRouter);
app.use('/api/sandbox',    sandboxRouter);
app.use('/api/jobs',       jobsRouter);
app.use('/api/audit',      auditRouter);
app.use('/api/artifacts',  artifactsRouter);
app.use('/api/sovereignty', sovereigntyRouter);
app.use('/api/ai',         aiRouter);
app.use('/api/auth',        authRouter);

// ─── POST /api/jobs  (create + run a new job) ─────────────────────────────────
// Defined here so ExecutionGraph has access to wsService
const server = createServer(app);
const wss    = new WebSocketServer({ server });
const wsService      = new WebSocketService(wss);
const executionGraph = new ExecutionGraph(wsService);

// Register executionGraph so orchestrator/JobManager can enqueue jobs
setExecutionGraph(executionGraph);

// NOTE: Job creation route moved to routes/jobs.ts with authentication
// This endpoint is kept for backward compatibility but should not be used in production

// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3001', 10);
// During test runs, avoid actually listening to the network to prevent EADDRINUSE
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      // Ensure auditService has loaded DB data when DATABASE_URL is present
      if (process.env.DATABASE_URL) await auditService.loadFromDb();
    } catch (e) {
      logger.warn({ err: e }, 'auditService initialization failed');
    }
    server.listen(PORT, () => {
      logger.info({ port: PORT, sovereignMode: process.env.SOVEREIGN_MODE }, 'SIH 2026 API started');
    });
  })();
}

export { app, server };
