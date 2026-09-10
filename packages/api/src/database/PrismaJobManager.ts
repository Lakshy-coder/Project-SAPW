import { PrismaClient } from '@prisma/client';
import { JobRequest, JobStatus, ExecutionNode } from '@sih2k26/core';
import { randomUUID } from 'crypto';

let prismaInstance: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = getPrisma();
    await prisma.$connect();
    await prisma.user.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

export class PrismaJobManager {
  static async createJob(request: JobRequest, userId: string, projectId: string) {
    const prisma = getPrisma();
    
    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, role: 'USER', status: 'ACTIVE' }
    });
    
    // Ensure project exists
    await prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: { id: projectId, name: `Project ${projectId}`, policyProfile: 'DEFAULT' }
    });
    
    const jobId = request.id || randomUUID();
    
    const job = await prisma.job.create({
      data: {
        id: jobId,
        userId,
        projectId,
        workflowVersion: '1.0',
        status: 'QUEUED',
        request: request as any
      },
      include: { nodes: true }
    });
    
    return this.toJobRecord(job);
  }
  
  static async getJob(jobId: string) {
    const prisma = getPrisma();
    
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { nodes: true }
    });
    
    if (!job) return undefined;
    
    return this.toJobRecord(job);
  }
  
  static async updateJobStatus(jobId: string, status: JobStatus) {
    const prisma = getPrisma();
    
    const job = await prisma.job.update({
      where: { id: jobId },
      data: { status, updatedAt: new Date() },
      include: { nodes: true }
    });
    
    return this.toJobRecord(job);
  }
  
  static async updateJobNodes(jobId: string, nodes: ExecutionNode[]) {
    const prisma = getPrisma();
    
    // Delete existing nodes and create new ones
    await prisma.jobNode.deleteMany({ where: { jobId } });
    
    for (const node of nodes) {
      await prisma.jobNode.create({
        data: {
          id: node.id,
          jobId,
          nodeType: node.type,
          state: node.state,
          inputsHash: node.inputsHash,
          outputsHash: node.outputsHash
        }
      });
    }
    
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { nodes: true }
    });
    
    if (!job) return undefined;
    
    return this.toJobRecord(job);
  }
  
  static async updateNodeState(jobId: string, nodeId: string, state: ExecutionNode['state']) {
    const prisma = getPrisma();
    
    await prisma.jobNode.update({
      where: { id: nodeId },
      data: { state, updatedAt: new Date() }
    });
    
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { nodes: true }
    });
    
    if (!job) return undefined;
    
    return this.toJobRecord(job);
  }
  
  private static toJobRecord(dbJob: any) {
    return {
      id: dbJob.id,
      projectId: dbJob.projectId,
      userId: dbJob.userId,
      workflowVersion: dbJob.workflowVersion,
      status: dbJob.status as JobStatus,
      createdAt: dbJob.createdAt,
      updatedAt: dbJob.updatedAt,
      request: dbJob.request,
      nodes: dbJob.nodes?.map((n: any) => ({
        id: n.id,
        jobId: n.jobId,
        type: n.nodeType,
        state: n.state,
        inputsHash: n.inputsHash,
        outputsHash: n.outputsHash,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt
      })) || []
    };
  }
  
  static async close() {
    if (prismaInstance) {
      await prismaInstance.$disconnect();
      prismaInstance = null;
    }
  }
}
