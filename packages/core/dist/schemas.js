"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobRequestSchema = exports.CapabilitySchema = exports.NodeStatusSchema = exports.JobStatusSchema = void 0;
const zod_1 = require("zod");
exports.JobStatusSchema = zod_1.z.enum([
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
exports.NodeStatusSchema = zod_1.z.enum([
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
exports.CapabilitySchema = zod_1.z.enum([
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
exports.JobRequestSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    intent: zod_1.z.string().min(1),
    capabilities: zod_1.z.array(exports.CapabilitySchema).min(1),
    riskLevel: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
    projectId: zod_1.z.string().optional(),
    userId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional(),
    rawRequest: zod_1.z.any().optional(),
    normalizedRequest: zod_1.z.any().optional(),
    attachedFileIds: zod_1.z.array(zod_1.z.string()).optional(),
    contentHashes: zod_1.z.array(zod_1.z.string()).optional()
});
