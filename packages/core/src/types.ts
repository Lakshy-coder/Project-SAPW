import { z } from 'zod';
import { JobStatusSchema, NodeStatusSchema, CapabilitySchema, JobRequestSchema } from './schemas';

export type JobStatus = z.infer<typeof JobStatusSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type JobRequest = z.infer<typeof JobRequestSchema>;

export interface ExecutionNode {
  id: string;
  jobId: string;
  type: string;
  state: NodeStatus;
  inputsHash?: string;
  outputsHash?: string;
  createdAt: Date;
  updatedAt: Date;
}
