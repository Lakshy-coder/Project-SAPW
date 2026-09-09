"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = require("express");
const OllamaAdapter_1 = require("../models/adapters/OllamaAdapter");
const ToolGateway_1 = require("../tools/ToolGateway");
const router = (0, express_1.Router)();
exports.aiRouter = router;
// ─── POST /api/ai/chat ───────────────────────────────────────────────────────
// Body: { message: string, systemPrompt?: string }
// Returns: { response: string, model: string }
router.post('/chat', async (req, res) => {
    const { message, systemPrompt } = req.body ?? {};
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'INVALID_INPUT', detail: 'message is required and must be a non-empty string' });
    }
    const available = await OllamaAdapter_1.ollamaAdapter.isAvailable();
    if (!available) {
        return res.status(503).json({
            error: 'OLLAMA_UNAVAILABLE',
            detail: 'Ollama is not reachable at ' + (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
        });
    }
    try {
        const text = await OllamaAdapter_1.ollamaAdapter.chat(message, systemPrompt);
        return res.json({
            response: text,
            model: process.env.OLLAMA_MODEL || 'qwen3:4b'
        });
    }
    catch (err) {
        const errCode = err.message?.split(':')[0] ?? 'AI_ERROR';
        const status = errCode === 'OLLAMA_MODEL_MISSING' ? 422 :
            errCode === 'OLLAMA_TIMEOUT' ? 504 :
                errCode === 'OLLAMA_UNAVAILABLE' ? 503 :
                    errCode === 'INVALID_INPUT' ? 400 : 500;
        return res.status(status).json({ error: errCode, detail: err.message });
    }
});
// ─── POST /api/ai/analyze ────────────────────────────────────────────────────
// Runs a registered deterministic tool, then asks Qwen to interpret the result.
// Body: { toolId: string, toolInput: object, question?: string }
// Returns: { toolResult, interpretation, model, citations? }
//
// Supported tools:
//   asme-b31-3-pipe-thickness — ASME B31.3 pipe wall thickness check
//
const ANALYZE_SYSTEM_PROMPT = `You are an industrial engineering compliance assistant.
The provided tool result is the SOLE authoritative source of truth.
Given a deterministic tool result, respond in exactly 4 short sections:
1. RESULT: One sentence on pass/fail and the key numbers.
2. CODE BASIS: The exact clause and edition used. Do not invent any codes.
3. RISK: If FAIL, explain the generic risk. DO NOT invent specific failure modes (like "collapse" or "rupture") or calculate remaining life unless explicitly provided in the data. If data is insufficient to assess specific risk, state "Insufficient data for failure mode; engineering review required." If PASS, write "Within safe operating limits."
4. ACTION: One concrete next step for the engineer.
CRITICAL: Be precise. Use only the values provided. Do not hallucinate safety margins, properties, or codes.`;
router.post('/analyze', async (req, res) => {
    const { toolId, toolInput, question } = req.body ?? {};
    // Input validation
    if (!toolId || typeof toolId !== 'string') {
        return res.status(400).json({ error: 'INVALID_INPUT', detail: 'toolId is required' });
    }
    if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
        return res.status(400).json({ error: 'INVALID_INPUT', detail: 'toolInput must be an object' });
    }
    // Check Ollama is up before doing expensive tool work
    const available = await OllamaAdapter_1.ollamaAdapter.isAvailable();
    if (!available) {
        return res.status(503).json({
            error: 'OLLAMA_UNAVAILABLE',
            detail: 'Ollama is not reachable at ' + (process.env.OLLAMA_BASE_URL || 'http://localhost:11434')
        });
    }
    // Run the deterministic tool — toolGateway handles validation, timeout, audit record
    let toolResult;
    let record;
    try {
        const permissions = ['tools:engineering', 'tools:knowledge'];
        ({ result: toolResult, record } = await ToolGateway_1.toolGateway.execute(toolId, toolInput, permissions));
    }
    catch (err) {
        const code = err.message?.split(':')[0] ?? 'TOOL_ERROR';
        const status = code === 'TOOL_NOT_FOUND' ? 404 : code === 'INPUT_ERROR' ? 400 : 500;
        return res.status(status).json({ error: code, detail: err.message });
    }
    // Build a structured prompt from the tool output — no raw secrets, no internal paths
    const userPrompt = [
        `Tool: ${toolId}`,
        `Input parameters: ${JSON.stringify(toolInput, null, 2)}`,
        `Tool result: ${JSON.stringify(toolResult, null, 2)}`,
        `Tool execution: ${record.status} in ${record.durationMs}ms`,
        question ? `\nEngineer's question: ${question}` : ''
    ].filter(Boolean).join('\n');
    // Ask Qwen to interpret
    let interpretation;
    try {
        interpretation = await OllamaAdapter_1.ollamaAdapter.chat(userPrompt, ANALYZE_SYSTEM_PROMPT);
    }
    catch (err) {
        const errCode = err.message?.split(':')[0] ?? 'AI_ERROR';
        const status = errCode === 'OLLAMA_TIMEOUT' ? 504 :
            errCode === 'OLLAMA_UNAVAILABLE' ? 503 : 500;
        return res.status(status).json({ error: errCode, detail: `Ollama timed out (>${process.env.OLLAMA_TIMEOUT_MS || 300000}ms). Try a shorter question or restart Ollama.` });
    }
    return res.json({
        toolId,
        toolResult,
        toolRecord: { status: record.status, durationMs: record.durationMs, inputHash: record.inputHash },
        interpretation,
        model: process.env.OLLAMA_MODEL || 'qwen3:4b'
    });
});
// ─── GET /api/ai/health ──────────────────────────────────────────────────────
// Quick Ollama-specific availability check (separate from /api/health)
router.get('/health', async (_req, res) => {
    const available = await OllamaAdapter_1.ollamaAdapter.isAvailable();
    return res.status(available ? 200 : 503).json({
        ollama: available ? 'UP' : 'UNAVAILABLE',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: process.env.OLLAMA_MODEL || 'qwen3:4b'
    });
});
