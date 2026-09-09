"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const PolicyEngine_1 = require("../security/PolicyEngine");
const jobsStore = new Map();
const storageDir = path_1.default.resolve(process.cwd(), '.runtime');
const storageFile = path_1.default.join(storageDir, 'jobs.json');
function normalizeNodes(nodes = []) {
    const seen = new Set();
    return (nodes ?? []).filter((node) => {
        const key = String(node?.id ?? '');
        if (!key || seen.has(key))
            return false;
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
function normalizeJobRecord(job) {
    if (!job || typeof job !== 'object')
        return job;
    const entries = { ...job, nodes: normalizeNodes(job.nodes ?? []) };
    if (!entries.id)
        entries.id = (0, crypto_1.randomUUID)();
    return entries;
}
async function ensureStorage() {
    await fs_1.promises.mkdir(storageDir, { recursive: true });
}
async function readPersistedJobs() {
    try {
        await ensureStorage();
        const raw = await fs_1.promises.readFile(storageFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return {};
        const normalized = {};
        for (const [jobId, value] of Object.entries(parsed)) {
            const job = normalizeJobRecord(value);
            normalized[jobId] = { ...job, id: job.id || jobId, nodes: normalizeNodes(job.nodes ?? []) };
        }
        return normalized;
    }
    catch {
        return {};
    }
}
async function writePersistedJobs(jobs) {
    await ensureStorage();
    await fs_1.promises.writeFile(storageFile, JSON.stringify(jobs, null, 2), 'utf8');
}
async function getBackendMode() {
    if (!process.env.DATABASE_URL)
        return 'FILE';
    try {
        const { PrismaClient } = await Promise.resolve().then(() => __importStar(require('@prisma/client')));
        const prisma = new PrismaClient();
        await prisma.$connect();
        await prisma.$disconnect();
        return 'PRISMA';
    }
    catch {
        return 'FILE';
    }
}
class JobManager {
    static async createJob(request, userId, projectId) {
        const persisted = await readPersistedJobs();
        const preferredId = request.id || (0, crypto_1.randomUUID)();
        const job = {
            id: preferredId,
            projectId,
            userId,
            workflowVersion: '1.0',
            status: 'QUEUED',
            createdAt: new Date(),
            updatedAt: new Date(),
            request: {
                ...request,
                capabilities: Array.isArray(request.capabilities) ? [...new Set(request.capabilities)] : ['GENERAL_REASONING']
            },
            nodes: []
        };
        jobsStore.set(job.id, job);
        await writePersistedJobs(Object.fromEntries(jobsStore.entries()));
        return job;
    }
    static async getJob(jobId) {
        if (!jobsStore.has(jobId)) {
            const persisted = await readPersistedJobs();
            const stored = persisted[jobId];
            if (!stored)
                return undefined;
            const normalized = normalizeJobRecord(stored);
            jobsStore.set(jobId, normalized);
            return normalized;
        }
        return normalizeJobRecord(jobsStore.get(jobId));
    }
    static async updateJobStatus(jobId, status) {
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
    static async addNodeToJob(jobId, node) {
        // This method is deprecated to prevent node duplication.
        // Nodes should be set once during planning and updated by reference.
        const job = await this.getJob(jobId);
        if (!job)
            return;
        // Only add if node doesn't already exist (prevent duplicates)
        const exists = job.nodes.some((n) => n.id === node.id);
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
    static async updateJobNodes(jobId, nodes) {
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
    static async evaluatePolicy(request, userPermissions = []) {
        const decision = PolicyEngine_1.policyEngine.evaluateJob(request, {
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
exports.JobManager = JobManager;
