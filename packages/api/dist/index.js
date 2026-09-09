"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const http_1 = require("http");
const ws_1 = require("ws");
const WebSocketService_1 = require("./services/WebSocketService");
const ExecutionGraph_1 = require("./orchestrator/ExecutionGraph");
const core_1 = require("@sih2k26/core");
const CapabilityRegistry_1 = require("./models/CapabilityRegistry");
const OllamaAdapter_1 = require("./models/adapters/OllamaAdapter");
// Tools — import to trigger self-registration
require("./tools/EngineeringCalculators");
// Routes
const health_1 = require("./routes/health");
const knowledge_1 = require("./routes/knowledge");
const tools_1 = require("./routes/tools");
const sandbox_1 = require("./routes/sandbox");
const jobs_1 = require("./routes/jobs");
const audit_1 = require("./routes/audit");
const artifacts_1 = require("./routes/artifacts");
const sovereignty_1 = require("./routes/sovereignty");
const ai_1 = require("./routes/ai");
// ─── Model Registration ──────────────────────────────────────────────────────
CapabilityRegistry_1.capabilityRegistry.register(OllamaAdapter_1.ollamaAdapter);
// ─── Logger ──────────────────────────────────────────────────────────────────
const logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
});
// ─── Express App ─────────────────────────────────────────────────────────────
const app = (0, express_1.default)();
exports.app = app;
app.use((0, cors_1.default)({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, pino_http_1.default)({ logger }));
// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', health_1.healthRouter);
app.use('/api/knowledge', knowledge_1.knowledgeRouter);
app.use('/api/tools', tools_1.toolsRouter);
app.use('/api/sandbox', sandbox_1.sandboxRouter);
app.use('/api/jobs', jobs_1.jobsRouter);
app.use('/api/audit', audit_1.auditRouter);
app.use('/api/artifacts', artifacts_1.artifactsRouter);
app.use('/api/sovereignty', sovereignty_1.sovereigntyRouter);
app.use('/api/ai', ai_1.aiRouter);
// ─── POST /api/jobs  (create + run a new job) ─────────────────────────────────
// Defined here so ExecutionGraph has access to wsService
const server = (0, http_1.createServer)(app);
exports.server = server;
const wss = new ws_1.WebSocketServer({ server });
const wsService = new WebSocketService_1.WebSocketService(wss);
const executionGraph = new ExecutionGraph_1.ExecutionGraph(wsService);
app.post('/api/jobs', async (req, res) => {
    try {
        const request = core_1.JobRequestSchema.parse(req.body);
        // Create job and queue for execution - return immediately with jobId
        // Execution runs in background and emits events over WebSocket
        const job = await executionGraph.createAndQueueJob(request, 'user-dev', 'project-dev');
        res.status(202).json(job); // 202 Accepted - job accepted, processing asynchronously
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    logger.error(err, 'Unhandled error');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
});
// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3001', 10);
server.listen(PORT, () => {
    logger.info({ port: PORT, sovereignMode: process.env.SOVEREIGN_MODE }, 'SIH 2026 API started');
});
