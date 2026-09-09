import { Capability } from '@sih2k26/core';
import { ModelProvider } from '../CapabilityRegistry';
export declare class OllamaAdapter implements ModelProvider {
    id: string;
    name: string;
    capabilities: Capability[];
    private get baseUrl();
    private get modelName();
    private get timeoutMs();
    isAvailable(): Promise<boolean>;
    /**
     * execute() satisfies the ModelProvider interface.
     * For chat-style calls with a systemPrompt, use chat() directly.
     */
    execute(prompt: string, _capabilities: Capability[]): Promise<string>;
    /**
     * chat() calls Ollama POST /api/chat with the messages array.
     * Supports an optional systemPrompt prepended as a system message.
     */
    chat(userMessage: string, systemPrompt?: string): Promise<string>;
    /**
     * Removes Qwen3 <think>…</think> reasoning blocks from the response,
     * leaving only the final answer the model intended to surface.
     * Handles nested tags and leading/trailing whitespace.
     */
    static stripThinkBlocks(text: string): string;
}
/** Shared singleton — import this instead of instantiating OllamaAdapter directly. */
export declare const ollamaAdapter: OllamaAdapter;
