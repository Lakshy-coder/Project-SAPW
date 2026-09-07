import express from 'express';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { WebSocketService } from './services/WebSocketService';
import { ExecutionGraph } from './orchestrator/ExecutionGraph';
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

// ─── POST /api/jobs  (create + run a new job) ─────────────────────────────────
// Defined here so ExecutionGraph has access to wsService
const server = createServer(app);
const wss    = new WebSocketServer({ server });
const wsService      = new WebSocketService(wss);
const executionGraph = new ExecutionGraph(wsService);

app.post('/api/jobs', async (req, res) => {
  try {
    const request = JobRequestSchema.parse(req.body);
    const job = await executionGraph.startJob(request, 'user-dev', 'project-dev');
    res.json(job);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error(err, 'Unhandled error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3001', 10);
server.listen(PORT, () => {
  logger.info({ port: PORT, sovereignMode: process.env.SOVEREIGN_MODE }, 'SIH 2026 API started');
});

export { app, server };
