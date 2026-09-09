"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ollamaAdapter = exports.OllamaAdapter = void 0;
class OllamaAdapter {
    id = 'ollama-local';
    name = 'Ollama Local Runtime';
    capabilities = ['GENERAL_REASONING', 'CODE_EXECUTION'];
    get baseUrl() {
        return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }
    get modelName() {
        return process.env.OLLAMA_MODEL || 'qwen3:4b';
    }
    get timeoutMs() {
        return parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);
    }
    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * execute() satisfies the ModelProvider interface.
     * For chat-style calls with a systemPrompt, use chat() directly.
     */
    async execute(prompt, _capabilities) {
        return this.chat(prompt);
    }
    /**
     * chat() calls Ollama POST /api/chat with the messages array.
     * Supports an optional systemPrompt prepended as a system message.
     */
    async chat(userMessage, systemPrompt) {
        if (!userMessage || !userMessage.trim()) {
            throw new Error('INVALID_INPUT: message must be a non-empty string');
        }
        const messages = [];
        if (systemPrompt && systemPrompt.trim()) {
            messages.push({ role: 'system', content: systemPrompt.trim() });
        }
        messages.push({ role: 'user', content: userMessage.trim() });
        let response;
        try {
            response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    messages,
                    stream: false
                }),
                signal: AbortSignal.timeout(this.timeoutMs)
            });
        }
        catch (err) {
            if (err.name === 'TimeoutError') {
                throw new Error('OLLAMA_TIMEOUT: request timed out after 120s');
            }
            throw new Error(`OLLAMA_UNAVAILABLE: ${err.message}`);
        }
        if (response.status === 404) {
            throw new Error(`OLLAMA_MODEL_MISSING: model '${this.modelName}' not found – run: ollama pull ${this.modelName}`);
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`OLLAMA_API_ERROR: HTTP ${response.status} – ${body}`);
        }
        let data;
        try {
            data = await response.json();
        }
        catch {
            throw new Error('OLLAMA_MALFORMED_RESPONSE: could not parse JSON from Ollama');
        }
        const content = data?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('OLLAMA_EMPTY_RESPONSE: Ollama returned no content');
        }
        return OllamaAdapter.stripThinkBlocks(content);
    }
    /**
     * Removes Qwen3 <think>…</think> reasoning blocks from the response,
     * leaving only the final answer the model intended to surface.
     * Handles nested tags and leading/trailing whitespace.
     */
    static stripThinkBlocks(text) {
        // Remove all <think>...</think> blocks (case-insensitive, dotAll)
        return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }
}
exports.OllamaAdapter = OllamaAdapter;
/** Shared singleton — import this instead of instantiating OllamaAdapter directly. */
exports.ollamaAdapter = new OllamaAdapter();
