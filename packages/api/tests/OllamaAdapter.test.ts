import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ollamaAdapter } from '../src/models/adapters/OllamaAdapter';

const okResponse = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ message: { content } })
});

describe('OllamaAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    // Pin env for deterministic tests
    process.env.OLLAMA_MODEL = 'qwen3:1.7b';
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_NUM_PREDICT;
    delete process.env.OLLAMA_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. think: false ─────────────────────────────────────────────────────────
  it('sends think: false in options for normal chat generation', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('Test response') as any);

    await ollamaAdapter.chat('Hello');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.options.think).toBe(false);
  });

  // ── 2. num_predict bounded to 384 by default ─────────────────────────────────
  it('sends num_predict: 384 by default', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('Concise response') as any);

    await ollamaAdapter.chat('Explain something');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.options.num_predict).toBe(384);
  });

  // ── 3. OLLAMA_NUM_PREDICT env-var override ────────────────────────────────────
  it('respects OLLAMA_NUM_PREDICT override', async () => {
    process.env.OLLAMA_NUM_PREDICT = '256';
    vi.mocked(fetch).mockResolvedValue(okResponse('Short response') as any);

    await ollamaAdapter.chat('Hello');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.options.num_predict).toBe(256);
  });

  // ── 4. Default model is qwen3:1.7b ────────────────────────────────────────────
  it('uses qwen3:1.7b as default model', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('Response') as any);

    await ollamaAdapter.chat('Hello');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('qwen3:1.7b');
  });

  // ── 5. OLLAMA_MODEL override ──────────────────────────────────────────────────
  it('respects OLLAMA_MODEL override', async () => {
    process.env.OLLAMA_MODEL = 'qwen3:4b';
    vi.mocked(fetch).mockResolvedValue(okResponse('Response') as any);

    await ollamaAdapter.chat('Hello');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('qwen3:4b');
    expect(body.options.think).toBe(false);
    expect(body.options.num_predict).toBe(384);
  });

  // ── 6. AbortSignal propagation ────────────────────────────────────────────────
  it('propagates AbortSignal correctly — throws OLLAMA_CANCELLED', async () => {
    const abortController = new AbortController();
    vi.mocked(fetch).mockImplementation(() =>
      new Promise((_, reject) => {
        abortController.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      })
    );

    const chatPromise = ollamaAdapter.chat('Hello', undefined, { signal: abortController.signal });
    abortController.abort('test reason');

    await expect(chatPromise).rejects.toThrow(/OLLAMA_CANCELLED/);
  });

  // ── 7. Pre-aborted signal is rejected immediately ─────────────────────────────
  it('immediately rejects if signal is already aborted before call', async () => {
    const abortController = new AbortController();
    abortController.abort('pre-aborted');

    await expect(
      ollamaAdapter.chat('Hello', undefined, { signal: abortController.signal })
    ).rejects.toThrow(/OLLAMA_CANCELLED/);

    // fetch should NOT have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  // ── 8. Timeout produces OLLAMA_TIMEOUT ────────────────────────────────────────
  it('throws OLLAMA_TIMEOUT when fetch throws an AbortError (simulating timeout)', async () => {
    // Simulate what happens when the internal AbortController fires after timeout:
    // fetch() rejects with a DOMException('AbortError') that is NOT from the user signal
    const timeoutAbortError = new DOMException('This operation was aborted', 'AbortError');
    vi.mocked(fetch).mockRejectedValue(timeoutAbortError);

    // No user signal provided → any abort must be from the internal timeout
    await expect(ollamaAdapter.chat('Hello')).rejects.toThrow(/OLLAMA_TIMEOUT/);
  });

  // ── 9. 404 → OLLAMA_MODEL_MISSING ────────────────────────────────────────────
  it('throws OLLAMA_MODEL_MISSING on 404', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404, text: async () => '' } as any);

    await expect(ollamaAdapter.chat('Hello')).rejects.toThrow(/OLLAMA_MODEL_MISSING/);
  });

  // ── 10. Connection refused → OLLAMA_UNAVAILABLE ───────────────────────────────
  it('throws OLLAMA_UNAVAILABLE when connection is refused', async () => {
    const connError = Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' });
    vi.mocked(fetch).mockRejectedValue(connError);

    await expect(ollamaAdapter.chat('Hello')).rejects.toThrow(/OLLAMA_UNAVAILABLE/);
  });

  // ── 11. Stream is always false ────────────────────────────────────────────────
  it('always sends stream: false', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse('ok') as any);

    await ollamaAdapter.chat('Hello');

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(false);
  });

  // ── 12. <think> blocks are stripped from the response ─────────────────────────
  it('strips Qwen3 <think>…</think> blocks from the response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse('<think>internal reasoning chain</think>The actual answer.') as any
    );

    const result = await ollamaAdapter.chat('Hello');
    expect(result).toBe('The actual answer.');
    expect(result).not.toContain('<think>');
  });
});
