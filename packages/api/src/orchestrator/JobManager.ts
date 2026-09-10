import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
import { policyEngine } from '../security/PolicyEngine';
import { enqueueExecution, hasExecutor } from './ExecutionCoordinator';
import { auditService } from '../audit/AuditService';
import { PrismaJobManager } from '../database/PrismaJobManager';
import { CapabilitySelector } from './CapabilitySelector';

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
    const selectedCapabilities = Array.isArray(request.capabilities) && request.capabilities.length > 0
      ? [...new Set(request.capabilities)]
      : CapabilitySelector.selectCapabilities(request);

    const enrichedRequest: JobRequest = {
      ...request,
      capabilities: selectedCapabilities
    };

    const persisted = await readPersistedJobs();
    const preferredId = request.id || randomUUID();

    if (process.env.DATABASE_URL) {
      try {
        const prismaJob = await PrismaJobManager.createJob(enrichedRequest, userId, projectId);
        if (prismaJob?.id) {
          const job = {
            ...prismaJob,
            id: prismaJob.id,
            projectId,
            userId,
            workflowVersion: '1.0',
            status: 'QUEUED' as JobStatus,
            createdAt: new Date(prismaJob.createdAt ?? Date.now()),
            updatedAt: new Date(prismaJob.updatedAt ?? Date.now()),
            request: {
              ...enrichedRequest,
              capabilities: [...new Set(enrichedRequest.capabilities)]
            },
            nodes: [] as ExecutionNode[]
          };
          jobsStore.set(job.id, job);
          await writePersistedJobs(Object.fromEntries(jobsStore.entries()));

          try {
            auditService.emit(job.id, 'JOB_QUEUED', { request: job.request }, { status: 'QUEUED' });
          } catch (e) {
            // best-effort
          }

          return job;
        }
      } catch (e) {
        // fall through to file-backed job creation if Prisma create fails
      }
    }

    const job = {
      id: preferredId,
      projectId,
      userId,
      workflowVersion: '1.0',
      status: 'QUEUED' as JobStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
      request: {
        ...enrichedRequest,
        capabilities: [...new Set(enrichedRequest.capabilities)]
      },
      nodes: [] as ExecutionNode[]
    };

    jobsStore.set(job.id, job);
    await writePersistedJobs(Object.fromEntries(jobsStore.entries()));

    // Emit an audit event indicating job queued
    try {
      auditService.emit(job.id, 'JOB_QUEUED', { request: job.request }, { status: 'QUEUED' });
    } catch (e) {
      // best-effort: do not fail creation if audit emits fail
    }

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

  static async updateJobState(jobId: string, patch: Record<string, any>) {
    const job = await this.getJob(jobId);
    if (job) {
      Object.assign(job, patch);
      job.updatedAt = new Date();
      jobsStore.set(jobId, job);
      await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
    }
    return job;
  }
}
