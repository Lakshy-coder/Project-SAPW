import { JobManager } from './JobManager';
import { Planner } from './Planner';
import { WebSocketService } from '../services/WebSocketService';
import { JobRequest } from '@sih2k26/core';
import pino from 'pino';

const logger = pino();

export class ExecutionGraph {
  constructor(private wsService: WebSocketService) {}

  async startJob(request: JobRequest, userId: string, projectId: string) {
    logger.info({ request }, 'Starting new job execution');
    
    const job = await JobManager.createJob(request, userId, projectId);
    this.wsService.broadcast('job.started', { jobId: job.id, request });

    await JobManager.updateJobStatus(job.id, 'RUNNING');
    
    const plan = Planner.createPlan(job.id, request);
    job.nodes = plan;
    
    this.wsService.broadcast('job.plan_created', { jobId: job.id, plan });

    // Execute nodes deterministically sequentially
    for (const node of plan) {
      await this.executeNode(job.id, node);
    }

    await JobManager.updateJobStatus(job.id, 'COMPLETED');
    this.wsService.broadcast('job.completed', { jobId: job.id });
    
    return job;
  }

  private async executeNode(jobId: string, node: any) {
    this.wsService.broadcast('node.started', { jobId, nodeId: node.id, type: node.type });
    node.state = 'RUNNING';
    node.updatedAt = new Date();
    
    // Simulate deterministic work
    await new Promise(resolve => setTimeout(resolve, 500));
    
    node.state = 'SUCCESS';
    node.updatedAt = new Date();
    node.outputsHash = 'mock_hash_' + node.type;
    
    this.wsService.broadcast('node.completed', { jobId, nodeId: node.id, state: node.state, outputsHash: node.outputsHash });
  }
}
