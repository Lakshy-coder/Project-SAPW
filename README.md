# SIH2K26 Sovereign Industrial AI Workbench

This repository is a local-first sovereign industrial AI prototype aligned to the architecture baseline for the SIH 2026 workbench.

## Trust model

The system follows the trust flow:

Z0 External / untrusted input
→ Z1 controlled application layer
→ Z2 restricted execution layer
→ Z3 verified decision layer
→ Z4 evidence and audit anchor

LLMs do not become trusted engineering authorities by themselves. Deterministic tools, policy evaluation, provenance checks, verification results, and signed audit history remain the authority for trusted final output.

## Current enforcement status

The implementation is truthful about what is actually enforced:

- Local model routing is implemented through a swappable adapter layer.
- Capability-based planning and job execution are implemented in the API runtime.
- Deterministic engineering checks are implemented as tool-based calculations.
- Verification and audit chains are implemented and persisted in a real runtime store.
- Sovereign network policy is enforced in the application layer for outbound target classification, while OS-level firewall enforcement remains outside the application boundary and is reported as such.
- Docker-based sandboxing is supported when available, and explicitly marked unavailable when the local environment lacks Docker.

## Local-first architecture

- API package: Express + TypeScript orchestration runtime
- Core package: shared schemas and capability contracts
- Workbench: Vite + React UI for task execution and evidence inspection
- Local model adapter: Ollama runtime via `OllamaAdapter`
- Deterministic tools: engineering calculators and tool gateway
- Runtime persistence: job state persists in a real runtime storage file with a Prisma fallback path when `DATABASE_URL` is available

## Demo mode

Demo fixtures must be isolated behind `DEMO_MODE=true` and are not part of the production path.

## Sovereign mode

Set:

- `SOVEREIGN_MODE=true`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434` or another private local endpoint

The app rejects non-private outbound targets when sovereign mode is active.

## Security boundary

- Network restrictions are implemented as policy evaluation and enforcement detection
- Generated code execution is blocked by the sandbox service when unsafe patterns are detected
- Docker is required for a secure execution boundary when the environment supports it
- No public cloud inference is accepted by the runtime policy checks

## Supported limitations

This prototype does not claim full OS-level air-gapping or real enterprise-scale production persistence when those capabilities are unavailable in the current environment. Where constraints exist, the system reports degraded or blocked status rather than silently fabricating success.

## Runtime entry points

- API: `packages/api/src/index.ts`
- Core contracts: `packages/core/src/*.ts`
- Workbench UI: `packages/workbench/src/App.tsx`

## Validation

The repository is validated with the project build and the automated test suite. The runtime remains intentionally conservative and fail-closed where the architecture requires it.