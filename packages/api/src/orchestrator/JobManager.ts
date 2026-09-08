import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
import { policyEngine } from '../security/PolicyEngine';

const jobsStore = new Map<string, any>();
const storageDir = path.resolve(process.cwd(), '.runtime');
const storageFile = path.join(storageDir, 'jobs.json');

function normalizeNodes(nodes: any[] = []): any[] {
  const seen = new Set<string>();
  return (nodes ?? []).filter((node) => {
    const key = String(node?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((node) => ({
    ...node,
    id: String(node.id),
    jobId: String(node.jobId ?? ''),
    type: String(node.type ?? 'UNKNOWN'),
    state: node.state ?? 'QUEUED',
    createdAt: node.createdAt ? new Date(node.createdAt) : new Date(),
    updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date(),
  }));
}

function normalizeJobRecord(job: any): any {
  if (!job || typeof job !== 'object') return job;
  const entries = { ...job, nodes: normalizeNodes(job.nodes ?? []) };
  if (!entries.id) entries.id = randomUUID();
  return entries;
}

async function ensureStorage() {
  await fs.mkdir(storageDir, { recursive: true });
}

async function readPersistedJobs(): Promise<Record<string, any>> {
  try {
    await ensureStorage();
    const raw = await fs.readFile(storageFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const normalized: Record<string, any> = {};
    for (const [jobId, value] of Object.entries(parsed)) {
      const job = normalizeJobRecord(value);
      normalized[jobId] = { ...job, id: job.id || jobId, nodes: normalizeNodes(job.nodes ?? []) };
    }
    return normalized;
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
    const persisted = await readPersistedJobs();
    const preferredId = request.id && !persisted[request.id] ? request.id : randomUUID();
    const job = {
      id: preferredId,
      projectId,
      userId,
      workflowVersion: '1.0',
      status: 'QUEUED' as JobStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      request: {
        ...request,
        capabilities: Array.isArray(request.capabilities) ? [...new Set(request.capabilities)] : ['GENERAL_REASONING']
      },
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
      const normalized = normalizeJobRecord(stored);
      jobsStore.set(jobId, normalized);
      return normalized;
    }
    return normalizeJobRecord(jobsStore.get(jobId));
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

  /**
   * @deprecated Nodes should be set during planning, not added individually.
   * Use updateJobNodes instead to persist the entire nodes array.
   */
  static async addNodeToJob(jobId: string, node: ExecutionNode) {
    // This method is deprecated to prevent node duplication.
    // Nodes should be set once during planning and updated by reference.
    const job = await this.getJob(jobId);
    if (!job) return;
    
    // Only add if node doesn't already exist (prevent duplicates)
    const exists = job.nodes.some((n: any) => n.id === node.id);
    if (!exists) {
      job.nodes.push(node);
      jobsStore.set(jobId, job);
      await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    }
  }

  /**
   * Update the entire nodes array for a job after execution changes.
   * Prevents node duplication by replacing the entire array.
   */
  static async updateJobNodes(jobId: string, nodes: ExecutionNode[]) {
    const job = await this.getJob(jobId);
    if (job) {
      const deduped = normalizeNodes(nodes);
      job.nodes = deduped;
      job.updatedAt = new Date();
      jobsStore.set(jobId, job);
      await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    }
    return job;
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
