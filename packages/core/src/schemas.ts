import { z } from 'zod';

export const JobStatusSchema = z.enum([
  'QUEUED', 'RUNNING', 'WAITING', 'VERIFIED', 'RETRYING', 'BLOCKED', 'FAILED', 'COMPLETED', 'CANCELLED'
]);

export const NodeStatusSchema = z.enum([
  'PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'BLOCKED'
]);

export const CapabilitySchema = z.enum([
  'CODE_EXECUTION', 'VISION_EXTRACTION', 'SOP_RETRIEVAL', 'ASME_CALCULATION', 'DOCUMENT_GENERATION', 'POLICY_CHECK', 'SIGNED_AUDIT', 'GENERAL_REASONING', 'EMBEDDING'
]);

export const JobRequestSchema = z.object({
  id: z.string().uuid().optional(),
  intent: z.string(),
  capabilities: z.array(CapabilitySchema),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW')
});
