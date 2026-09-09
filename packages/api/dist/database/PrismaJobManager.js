"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaJobManager = void 0;
exports.checkDatabaseConnection = checkDatabaseConnection;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
let prismaInstance = null;
function getPrisma() {
    if (!prismaInstance) {
        prismaInstance = new client_1.PrismaClient();
    }
    return prismaInstance;
}
async function checkDatabaseConnection() {
    try {
        const prisma = getPrisma();
        await prisma.$connect();
        await prisma.user.findFirst({ take: 1 });
        return true;
    }
    catch {
        return false;
    }
}
class PrismaJobManager {
    static async createJob(request, userId, projectId) {
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
        const jobId = request.id || (0, crypto_1.randomUUID)();
        const job = await prisma.job.create({
            data: {
                id: jobId,
                userId,
                projectId,
                workflowVersion: '1.0',
                status: 'QUEUED',
                request: request
            },
            include: { nodes: true }
        });
        return this.toJobRecord(job);
    }
    static async getJob(jobId) {
        const prisma = getPrisma();
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { nodes: true }
        });
        if (!job)
            return undefined;
        return this.toJobRecord(job);
    }
    static async updateJobStatus(jobId, status) {
        const prisma = getPrisma();
        const job = await prisma.job.update({
            where: { id: jobId },
            data: { status, updatedAt: new Date() },
            include: { nodes: true }
        });
        return this.toJobRecord(job);
    }
    static async updateJobNodes(jobId, nodes) {
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
        if (!job)
            return undefined;
        return this.toJobRecord(job);
    }
    static async updateNodeState(jobId, nodeId, state) {
        const prisma = getPrisma();
        await prisma.jobNode.update({
            where: { id: nodeId },
            data: { state, updatedAt: new Date() }
        });
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { nodes: true }
        });
        if (!job)
            return undefined;
        return this.toJobRecord(job);
    }
    static toJobRecord(dbJob) {
        return {
            id: dbJob.id,
            projectId: dbJob.projectId,
            userId: dbJob.userId,
            workflowVersion: dbJob.workflowVersion,
            status: dbJob.status,
            createdAt: dbJob.createdAt,
            updatedAt: dbJob.updatedAt,
            request: dbJob.request,
            nodes: dbJob.nodes?.map((n) => ({
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
exports.PrismaJobManager = PrismaJobManager;
