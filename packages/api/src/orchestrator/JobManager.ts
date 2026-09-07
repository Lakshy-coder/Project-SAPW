import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
import { randomUUID } from 'crypto';

// In-memory store for fallback/testing when DB is unavailable
const jobsStore = new Map<string, any>();

export class JobManager {
  static async createJob(request: JobRequest, userId: string, projectId: string) {
    const job = {
      id: request.id || randomUUID(),
      projectId,
      userId,
      workflowVersion: '1.0',
      status: 'QUEUED' as JobStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      request,
      nodes: [] as ExecutionNode[]
    };
    jobsStore.set(job.id, job);
    return job;
  }

  static async getJob(jobId: string) {
    return jobsStore.get(jobId);
  }

  static async updateJobStatus(jobId: string, status: JobStatus) {
    const job = await this.getJob(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date();
      jobsStore.set(jobId, job);
    }
    return job;
  }

  static async addNodeToJob(jobId: string, node: ExecutionNode) {
    const job = await this.getJob(jobId);
    if (job) {
      job.nodes.push(node);
      jobsStore.set(jobId, job);
    }
  }
}
