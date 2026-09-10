# SIH2K26 Sovereign Industrial AI Workbench — Agent Instructions

This file guides collaborative AI agents working on the SIH2K26 codebase. See [README.md](../README.md) and [FINAL_PROTOTYPE_METRICS_AND_PROOFS.md](../docs/FINAL_PROTOTYPE_METRICS_AND_PROOFS.md) for architectural details and validation proof.

## 1. Trust Model & Design Principles

The workbench enforces a **Z0→Z4 trust escalation flow**:

| Level | Role | Guarantee |
|-------|------|-----------|
| **Z0** | External/untrusted input | No enforcement |
| **Z1** | Application layer validation | Input schema validation (Zod) + CORS checks |
| **Z2** | Execution sandbox | Docker isolation + policy enforcement in `PolicyEngine` |
| **Z3** | Verification layer | Hash-based verification of node inputs/outputs; audit events recorded |
| **Z4** | Evidence & audit anchor | Signed audit history persists in Prisma (`Job`, `AuditEvent`, `ExecutionReceipt`) |

**Core principle**: LLMs do not become trusted authorities. Deterministic tools, policy evaluation, provenance checks, verification results, and audit history remain the authority.

**Fail-closed design**: System reports degraded/blocked status rather than silently fabricating success. No implicit cloud calls; network destinations are explicitly classified (sovereign vs. unrestricted).

---

## 2. Monorepo Structure & Quick Commands

**Packages:**
- `packages/api/` — Express runtime, services, routes, tools, security policies
- `packages/core/` — Shared Zod schemas, types, contracts (`@sih2k26/core`)
- `packages/workbench/` — React 19 + Vite UI for task execution & evidence inspection

**Fast Commands:**

```bash
# Root: run all packages in parallel
npm run dev                   # Dev servers for api + workbench
npm run build                 # Build all packages (tsc + vite)
npm run test                  # Vitest across all packages

# Backend (packages/api)
npm run -w packages/api dev              # Watch tsx + API server
npm run -w packages/api test:watch       # Vitest watch
npm run -w packages/api db:studio        # Prisma Studio (GUI)
docker-compose up                         # Start PostgreSQL + Qdrant services

# Frontend (packages/workbench)
npm run -w packages/workbench dev        # Vite dev server (HMR enabled)
npm run -w packages/workbench build      # Build optimized bundle
npm run -w packages/workbench lint       # Oxlint type-aware checks

# Demo/Integration
DEMO_MODE=true SOVEREIGN_MODE=true npm run dev
```

---

## 3. Architecture: Key Services & Patterns

### Core Execution Flow

```
Request (Z0)
  ↓ [Z1 → Zod validation + middleware]
  ↓ Express route handler (auth required)
  ↓ ExecutionGraph::plan() — dependency graph from user task
  ↓ Planner::sequence() — topological sort + CapabilitySelector binding
  ↓ JobManager::enqueue() — persist Job + notes to Prisma
  ↓ [on_process] → Z2 execution
    ├─ ToolGateway::invoke() → EngineeringCalculators, RagService, etc.
    ├─ ModelRouter → OllamaAdapter (local LLM)
    ├─ SandboxService (Docker restriction)
    ├─ PolicyEngine (network policy check)
    └─ Verification::verify() → hash-based integrity checks
  ↓ [Z3 → Z4] record JobNode state + AuditEvent + ExecutionReceipt
  ↓ WebSocketService emit updates (async long-running)
  ↓ Response: Job ID + initial status
```

### Service Layer

**Orchestration:**
- `ExecutionGraph` — builds DAG from capabilities; tracks node dependencies
- `Planner` — topological sort; binds capabilities to nodes
- `JobManager` — Prisma persistence; queuing; status lifecycle (QUEUED → RUNNING → SUCCEEDED|FAILED|BLOCKED)
- `CapabilitySelector` — resolves user request → capability name + parameters

**Execution & Security:**
- `ToolGateway` → `ToolRegistry` — routes tool invocations; tools self-register on import
- `ModelRouter` → `OllamaAdapter` — pluggable local LLM (swappable for other adapters)
- `SandboxService` — Docker image restriction detection; code pattern blocking (unsafe constructs)
- `PolicyEngine` — network destination classification (private vs. public); rejects public targets when `SOVEREIGN_MODE=true`
- `NetworkMonitor` — logs outbound attempts (informational; OS-level firewall is outside app boundary)

**Knowledge & Verification:**
- `RagService` → `BM25Search` + `VectorSearch` — semantic + lexical document retrieval
- `Verifier` — hash-based input/output verification; audit trail recording
- `AuditService` — reads persisted `AuditEvent` records; computes trust scores

**User-Facing:**
- `DeliverableService` — formats final response; embeds verification receipts
- `WebSocketService` — long-running job streaming updates to frontend

---

## 4. Data Model (Prisma)

**Key tables** (see `packages/api/prisma/schema.prisma`):

- `User` (role, status) — authentication identity
- `Project` (name, policyProfile, User FK) — isolation boundary
- `Job` (status, nodes JSON, artifacts JSON, project FK, startedAt, completedAt)
- `JobNode` — task within job; holds hashes, verification state, result data
- `AuditEvent` — Z4 anchor; immutable record of decision with evidence
- `ExecutionReceipt` — signed verification tuple per node
- `Document` — chunks for RAG (embedding, text, source)
- `ToolExecution` — logs tool invocations for traceability

**Queries:**
```bash
npm run -w packages/api db:studio          # GUI explorer
npm run -w packages/api db:push            # Auto-migrate
npm run -w packages/api db:generate        # Regenerate @prisma/client
```

---

## 5. API Routes & Response Conventions

**Route structure** (`packages/api/src/routes/`):

| Route | Responsibility |
|-------|-----------------|
| `/api/health` | Liveness + dependency status (DB, LLM, Docker) |
| `/api/jobs` | POST (create), GET (list), GET /:id (status + audit) |
| `/api/ai` | Chat-like interface; routes to planning + execution |
| `/api/tools` | Inventory + dry-run of available tools |
| `/api/audit` | Read-only access to `AuditEvent` table |
| `/api/sandbox` | Code restriction checks; status |
| `/api/artifacts` | Upload/download Job outputs |
| `/api/knowledge` | Manage document corpus (RAG training data) |
| `/api/auth` | Login, permission checks |
| `/api/sovereignty` | Verify sovereign mode + policy checks |

**Response Convention:**

```typescript
// Success
{ data: T, jobId?: string, status: "QUEUED|RUNNING|SUCCEEDED|FAILED|BLOCKED" }

// Error
{ error: "ERROR_CODE", message?: "human readable", statusCode: number }

// Node state lifecycle
"PENDING" → "EXECUTING" → "COMPLETE|FAILED|VERIFICATION_PENDING"
```

---

## 6. Configuration & Environment

**Critical env vars:**

```bash
# Inference (Ollama)
OLLAMA_BASE_URL=http://127.0.0.1:11434  # Default: localhost
OLLAMA_MODEL=neural-chat                 # Model name to invoke
OLLAMA_TIMEOUT_MS=120000                 # Request timeout

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sih2k26  # Required for persistence
# Fallback: in-memory store if absent (demo only)

# Security & Policy
SOVEREIGN_MODE=true                      # Reject non-private outbound targets
ALLOWED_ORIGINS=http://localhost:5173    # CORS whitelist

# Flags
DEMO_MODE=true                           # Isolate fixture data
LOG_LEVEL=info                           # Pino log level

# Execution
DOCKER_ENABLED=true                      # Optional; auto-detected if Docker available
```

**Setup (one-time):**

```bash
# Copy .env template
cp .env.example .env

# Start services (PostgreSQL 5432 + Qdrant 6333)
docker-compose up -d

# Ensure API can connect
npm run -w packages/api db:push          # Apply Prisma schema

# (Optional) Pre-populate Ollama with a model
ollama model create neural-chat          # or other chosen model
```

---

## 7. Development Conventions

### TypeScript & Strict Mode

- All packages compile with `strict: true`, `forceConsistentCasingInFileNames`, composite projects
- CommonJS output (Express compatibility)
- Zod runtime validation on all inputs

### Input/Output Validation

```typescript
import { z } from "zod";

// Define schema
const JobRequestSchema = z.object({
  projectId: z.string().uuid(),
  taskDescription: z.string().min(1),
  toolsAllowed: z.array(z.string()).optional(),
});

// Validate
const parsed = JobRequestSchema.parse(req.body);  // throws on invalid
```

### Hashing & Verification

```typescript
import crypto from "crypto";

// Verify node output matches expected hash
const nodeHash = crypto.createHash("sha256").update(JSON.stringify(node.output)).digest("hex");
if (nodeHash !== node.expectedHash) {
  throw new Error(`Verification failed: ${nodeHash} != ${node.expectedHash}`);
}
```

### Tool Self-Registration

Tools register automatically on import. Adding a new tool:

1. Create `packages/api/src/tools/MyTool.ts`:
   ```typescript
   export class MyTool {
     static register() {
       ToolRegistry.register("my-tool", this);
     }
   }
   MyTool.register();
   ```

2. Import in `ToolGateway` or `index.ts`:
   ```typescript
   import "./tools/MyTool";  // Triggers register()
   ```

### Auth Middleware

```typescript
import { requireAuth, requirePermission } from "./auth/middleware";

// Protect route
app.get("/api/jobs/:id", requireAuth(["admin", "user"]), async (req, res) => {
  // req.user is populated
});
```

### WebSocket Job Updates

```typescript
// Client (React)
const ws = new WebSocket(`ws://localhost:3000/ws?jobId=${jobId}`);
ws.onmessage = (e) => {
  const update = JSON.parse(e.data);  // { status, nodeProgress, artifacts }
};

// Server (WebSocketService)
await WebSocketService.emit(jobId, { status: "RUNNING", nodes: [...] });
```

---

## 8. Testing

**Test patterns:**

```typescript
// Vitest + Supertest for API routes
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../src/index";

describe("GET /api/jobs/:id", () => {
  it("should return job status", async () => {
    const res = await request(app)
      .get("/api/jobs/some-id")
      .expect(200);
    expect(res.body).toHaveProperty("status", "SUCCEEDED");
  });
});
```

**Run tests:**

```bash
npm run test                  # Run all
npm run -w packages/api test:watch  # Watch mode
```

**Test files location:** `packages/api/tests/*.test.ts`

---

## 9. Common Workflows

### Adding a New Route

1. Create `packages/api/src/routes/myfeature.ts`:
   ```typescript
   import express from "express";
   const router = express.Router();
   router.get("/", async (req, res) => { /* ... */ });
   export default router;
   ```

2. Register in `packages/api/src/index.ts`:
   ```typescript
   import myfeatureRoutes from "./routes/myfeature";
   app.use("/api/myfeature", myfeatureRoutes);
   ```

3. Add integration test in `packages/api/tests/myfeature.test.ts`

### Adding a New Tool

1. Create `packages/api/src/tools/MyTool.ts`
2. Implement `invoke(params): Promise<Result>`
3. Add self-registration: `MyTool.register()`
4. Import in main to trigger registration
5. Add tool spec + test coverage

### Updating Data Model

1. Edit `packages/api/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name my_migration`
3. Regenerate: `npm run -w packages/api db:generate`
4. Update Prisma client usage in services

### Local LLM Model Swap

Edit `.env`:

```bash
OLLAMA_MODEL=mistral          # Try a different model
OLLAMA_TIMEOUT_MS=180000      # Increase if model is slow
```

Restart API; Ollama adapter will fetch new model on first inference.

---

## 10. Debugging & Diagnostics

### Log Inspection

Logs use Pino (JSON format). View in terminal or parse with `pino-pretty`:

```bash
npm install -g pino-pretty
npm run -w packages/api dev | pino-pretty
```

### Database State

Inspect Job + AuditEvent records:

```bash
npm run -w packages/api db:studio  # GUI
# or
npm run -w packages/api db:push && psql -c "SELECT * FROM Job LIMIT 5;"
```

### Network Policy Checks

Verify sovereign mode behavior:

```bash
curl -X POST http://localhost:3000/api/sovereignty/check \
  -H "Content-Type: application/json" \
  -d '{"target": "https://example.com"}'
# Expected: { allowed: false, reason: "public target in sovereign mode" }
```

### Health & Status

```bash
curl http://localhost:3000/api/health
# Response: { status: "healthy", db: "connected", ollama: "ready", docker: "available" }
```

---

## 11. Common Pitfalls & Patterns

| Issue | Solution |
|-------|----------|
| **"Ollama connection refused"** | Check `OLLAMA_BASE_URL`, run `ollama serve` |
| **"DATABASE_URL not set"** | Copy `.env.example → .env` + configure PostgreSQL |
| **"Docker not available"** | Set `DOCKER_ENABLED=false` (sandbox uses fallback policy) |
| **TypeScript strict mode errors** | All files must satisfy `strict: true`; no implicit any |
| **Import cycles** | Keep core types in `packages/core`, routes/services isolated |
| **WebSocket not updating** | Ensure client subscribes before job starts; check firewall |
| **Test flakes on CI** | Increase `OLLAMA_TIMEOUT_MS`; mock LLM in unit tests |

---

## 12. Suggested Agent Specializations

For complex tasks, consider enabling scoped instructions:

- **`.github/copilot-instructions-backend.md`** — API architecture + Prisma patterns
- **`.github/copilot-instructions-frontend.md`** — React hooks + Vite patterns
- **`.github/copilot-instructions-security.md`** — Trust model + policy enforcement
- **`.github/copilot-instructions-testing.md`** — Vitest + Supertest patterns

---

## 13. Links & References

- **Architecture proof:** [docs/FINAL_PROTOTYPE_METRICS_AND_PROOFS.md](../docs/FINAL_PROTOTYPE_METRICS_AND_PROOFS.md)
- **Build proof:** [docs/proofs/build-results.txt](../docs/proofs/build-results.txt)
- **Test suite:** [docs/proofs/test-results.txt](../docs/proofs/test-results.txt)
- **Prisma schema:** [packages/api/prisma/schema.prisma](../packages/api/prisma/schema.prisma)
- **Core types:** [packages/core/src/types.ts](../packages/core/src/types.ts)

---

**Version:** SIH2K26 Prototype (Sept 2026)  
**Last updated:** This session  
**Status:** Active development
