import { Router, Request, Response } from 'express';
import { sandboxService } from '../sandbox/SandboxService';
import { vectorSearch } from '../rag/VectorSearch';
import { capabilityRegistry } from '../models/CapabilityRegistry';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const modelStatuses = await Promise.all(
    capabilityRegistry.getAllProviders().map(async p => ({
      id: p.id,
      name: p.name,
      capabilities: p.capabilities,
      available: await p.isAvailable()
    }))
  );

  const sandboxAvailable = await sandboxService.isDockerAvailable();
  const qdrantAvailable = await vectorSearch.isAvailable();

  const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
  const allModelsUnavailable = modelStatuses.every(m => !m.available);

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sovereignMode,
    components: {
      api: { status: 'UP' },
      sandbox: { status: sandboxAvailable ? 'UP' : 'UNAVAILABLE', backend: sandboxAvailable ? 'docker-network-none' : 'none' },
      qdrant: { status: qdrantAvailable ? 'UP' : 'UNAVAILABLE' },
      models: modelStatuses,
      modelState: allModelsUnavailable ? 'MODEL_UNAVAILABLE' : 'READY'
    },
    networkPolicy: {
      mode: sovereignMode ? 'SOVEREIGN' : 'DEVELOPMENT',
      publicEndpointsAllowed: !sovereignMode,
      cloudInferenceAllowed: false
    }
  });
});

export { router as healthRouter };
