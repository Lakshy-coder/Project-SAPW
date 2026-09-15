import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Capability } from '@sih2k26/core';
import { ModelProvider } from '../CapabilityRegistry';

const loadProjectEnv = () => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'packages/api/.env'),
    path.resolve(process.cwd(), '..', 'packages', 'api', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env')
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

export class OllamaAdapter implements ModelProvider {
  id = 'ollama-local';
  name = 'Ollama Local Runtime';
  capabilities: Capability[] = ['GENERAL_REASONING', 'CODE_EXECUTION'];

  private syncRuntimeConfig() {
    loadProjectEnv();
  }

  private get baseUrl() {
    this.syncRuntimeConfig();
    return process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  }

  private get modelName() {
    this.syncRuntimeConfig();
    return process.env.OLLAMA_MODEL || 'qwen3:1.7b';
  }

  private get timeoutMs() {
    this.syncRuntimeConfig();
    return parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);
  }

  /**
   * Bounded generation limit — prevents the model from generating thousands of tokens
   * for concise engineering synthesis tasks. Configurable via OLLAMA_NUM_PREDICT.
   * Default: 384 tokens (~300 words), sufficient for a concise engineering explanation.
   */
  private get numPredict() {
    this.syncRuntimeConfig();
    return parseInt(process.env.OLLAMA_NUM_PREDICT || '384', 10);
  }

  async isAvailable(): Promise<boolean> {
    this.syncRuntimeConfig();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * execute() satisfies the ModelProvider interface.
   * For chat-style calls with a systemPrompt, use chat() directly.
   */
  async execute(prompt: string, _capabilities: Capability[], options?: { signal?: AbortSignal }): Promise<string> {
    return this.chat(prompt, undefined, options);
  }

  /**
   * chat() calls Ollama POST /api/chat with the messages array.
   * Supports an optional systemPrompt prepended as a system message.
   */
  async chat(userMessage: string, systemPrompt?: string, options?: { signal?: AbortSignal }): Promise<string> {
    this.syncRuntimeConfig();
    if (!userMessage || !userMessage.trim()) {
      throw new Error('INVALID_INPUT: message must be a non-empty string');
    }

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt && systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt.trim() });
    }
    messages.push({ role: 'user', content: userMessage.trim() });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(new Error('TIMEOUT')), this.timeoutMs);
    
    const abortListener = () => timeoutController.abort(options?.signal?.reason);
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        throw new Error('OLLAMA_CANCELLED: request was aborted before execution');
      }
      options.signal.addEventListener('abort', abortListener);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream: false,
          options: {
            think: false,
            num_predict: this.numPredict
          }
        }),
        signal: timeoutController.signal
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || err.message === 'TIMEOUT' || err.name === 'TimeoutError') {
        const isCancelled = options?.signal?.aborted;
        throw new Error(isCancelled ? 'OLLAMA_CANCELLED: request was aborted' : `OLLAMA_TIMEOUT: request timed out after ${this.timeoutMs}ms`);
      }
      if (err.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
        throw new Error(`OLLAMA_UNAVAILABLE: Connection refused at ${this.baseUrl}. Is Ollama running?`);
      }
      throw new Error(`OLLAMA_UNAVAILABLE: ${err.message}`);
    } finally {
      if (options?.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
    }

    if (response.status === 404) {
      throw new Error(`OLLAMA_MODEL_MISSING: model '${this.modelName}' not found – run: ollama pull ${this.modelName}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OLLAMA_API_ERROR: HTTP ${response.status} – ${body}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
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
  static stripThinkBlocks(text: string): string {
    // Remove all <think>...</think> blocks (case-insensitive, dotAll)
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
}

/** Shared singleton — import this instead of instantiating OllamaAdapter directly. */
export const ollamaAdapter = new OllamaAdapter();
