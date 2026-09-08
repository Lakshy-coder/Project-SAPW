import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING',
  'VERIFIED',
  'RETRYING',
  'BLOCKED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
  'SUCCESS',
  'PARTIAL',
  'PENDING'
]);

export const NodeStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING',
  'VERIFIED',
  'RETRYING',
  'BLOCKED',
  'FAILED',
  'COMPLETED',
  'CANCELLED',
  'SUCCESS',
  'PARTIAL',
  'PENDING'
]);

export const CapabilitySchema = z.enum([
  'GENERAL_REASONING',
  'CODE_GENERATION',
  'CODE_EXECUTION',
  'VISION_EXTRACTION',
  'SOP_RETRIEVAL',
  'EMBEDDINGS',
  'ASME_CALCULATION',
  'DOCUMENT_GENERATION',
  'POLICY_CHECK',
  'SIGNED_AUDIT'
]);

export const JobRequestSchema = z.object({
  id: z.string().uuid().optional(),
  intent: z.string().min(1),
  capabilities: z.array(CapabilitySchema).min(1),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  rawRequest: z.any().optional(),
  normalizedRequest: z.any().optional(),
  attachedFileIds: z.array(z.string()).optional(),
  contentHashes: z.array(z.string()).optional()
});
