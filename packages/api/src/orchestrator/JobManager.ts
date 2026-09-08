import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
import { policyEngine } from '../security/PolicyEngine';

const jobsStore = new Map<string, any>();
const storageDir = path.resolve(process.cwd(), '.runtime');
const storageFile = path.join(storageDir, 'jobs.json');

async function ensureStorage() {
  await fs.mkdir(storageDir, { recursive: true });
}

async function readPersistedJobs(): Promise<Record<string, any>> {
  try {
    await ensureStorage();
    const raw = await fs.readFile(storageFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePersistedJobs(jobs: Record<string, any>) {
  await ensureStorage();
  await fs.writeFile(storageFile, JSON.stringify(jobs, null, 2), 'utf8');
}

async function getBackendMode(): Promise<'FILE' | 'PRISMA'> {
  if (!process.env.DATABASE_URL) return 'FILE';
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$disconnect();
    return 'PRISMA';
  } catch {
    return 'FILE';
  }
}

export class JobManager {
  static async createJob(request: JobRequest, userId: string, projectId: string) {
    const id = request.id || randomUUID();
    const job = {
      id,
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
    await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    return job;
  }

  static async getJob(jobId: string) {
    if (!jobsStore.has(jobId)) {
      const persisted = await readPersistedJobs();
      const stored = persisted[jobId];
      if (!stored) return undefined;
      jobsStore.set(jobId, stored);
    }
    return jobsStore.get(jobId);
  }

  static async updateJobStatus(jobId: string, status: JobStatus) {
    const job = await this.getJob(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date();
      jobsStore.set(jobId, job);
      await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    }
    return job;
  }

  static async addNodeToJob(jobId: string, node: ExecutionNode) {
    const job = await this.getJob(jobId);
    if (job) {
      job.nodes.push(node);
      jobsStore.set(jobId, job);
      await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    }
  }

  static async evaluatePolicy(request: JobRequest, userPermissions: string[] = []) {
    const decision = policyEngine.evaluateJob(request, {
      userPermissions,
      projectPolicy: 'DEFAULT',
      modelEndpoint: process.env.OLLAMA_BASE_URL,
      executionEnvironment: process.env.SOVEREIGN_MODE === 'true' ? 'PRIVATE_LAN' : 'LOCAL',
      inputSensitivity: 'INTERNAL',
      demoMode: process.env.DEMO_MODE === 'true',
      sovereignMode: process.env.SOVEREIGN_MODE === 'true',
      sandboxAvailable: process.env.DOCKER_AVAILABLE === 'true',
      requiredCapabilities: request.capabilities
    });

    return decision;
  }

  static async backendMode() {
    return getBackendMode();
  }
}
