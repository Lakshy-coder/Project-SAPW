import { ollamaAdapter } from './packages/api/src/models/adapters/OllamaAdapter.ts';
import { ModelRouter } from './packages/api/src/models/ModelRouter.ts';
import { capabilityRegistry } from './packages/api/src/models/CapabilityRegistry.ts';

capabilityRegistry.register(ollamaAdapter);
console.log('ENV', process.env.OLLAMA_BASE_URL, process.env.OLLAMA_MODEL);
console.log('AVAILABLE', await ollamaAdapter.isAvailable());

try {
  const r = await ModelRouter.route('GENERAL_REASONING', 'Explain in one sentence what a compiler does.');
  console.log('ROUTED', r.slice(0, 200));
} catch (e) {
  console.error('ROUTE_ERR', e && e.message ? e.message : String(e));
}

try {
  const x = await ollamaAdapter.chat('Explain the difference between a compiler and an interpreter in simple terms.');
  console.log('CHAT', x.slice(0, 200));
} catch (e) {
  console.error('CHAT_ERR', e && e.message ? e.message : String(e));
}
