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
exports.ExecutionGraph = void 0;
const crypto_1 = require("crypto");
const JobManager_1 = require("./JobManager");
const Planner_1 = require("./Planner");
const CapabilitySelector_1 = require("./CapabilitySelector");
const Verifier_1 = require("../verification/Verifier");
const ToolGateway_1 = require("../tools/ToolGateway");
const PolicyEngine_1 = require("../security/PolicyEngine");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
/**
 * Extracts engineering parameters from user request intent.
 * Returns NEEDS_INPUT state if required parameters are missing.
 */
function extractEngineeringParameters(intent, rawRequest) {
    const extractedParams = {};
    const missingFields = [];
    // Try to extract from rawRequest first (structured input)
    if (rawRequest && typeof rawRequest === 'object') {
        if (typeof rawRequest.designPressureMPa === 'number')
            extractedParams.designPressureMPa = rawRequest.designPressureMPa;
        if (typeof rawRequest.outsideDiameterMM === 'number')
            extractedParams.outsideDiameterMM = rawRequest.outsideDiameterMM;
        if (typeof rawRequest.allowableStressMPa === 'number')
            extractedParams.allowableStressMPa = rawRequest.allowableStressMPa;
        if (typeof rawRequest.measuredThicknessMM === 'number')
            extractedParams.measuredThicknessMM = rawRequest.measuredThicknessMM;
        if (typeof rawRequest.weldJointFactor === 'number')
            extractedParams.weldJointFactor = rawRequest.weldJointFactor;
        if (typeof rawRequest.yCoefficient === 'number')
            extractedParams.yCoefficient = rawRequest.yCoefficient;
    }
    // Check what's missing for ASME calculation
    if (extractedParams.designPressureMPa === undefined)
        missingFields.push('designPressureMPa');
    if (extractedParams.outsideDiameterMM === undefined)
        missingFields.push('outsideDiameterMM');
    if (extractedParams.allowableStressMPa === undefined)
        missingFields.push('allowableStressMPa');
    return {
        status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY',
        missingFields,
        extractedParams
    };
}
class ExecutionGraph {
    wsService;
    constructor(wsService) {
        this.wsService = wsService;
    }
    /**
     * Creates a job with initial status without waiting for execution.
     * Execution is started asynchronously in the background.
     * Returns the job object with QUEUED status immediately.
     *
     * Capabilities are selected based on the task intent using CapabilitySelector.
     */
    async createAndQueueJob(request, userId, projectId) {
        logger.info({ requestIntent: request.intent }, 'Creating and queueing new job');
        // Select capabilities based on task intent (not hardcoded)
        const selectedCapabilities = CapabilitySelector_1.CapabilitySelector.selectCapabilities(request);
        const enrichedRequest = {
            ...request,
            capabilities: selectedCapabilities
        };
        const job = await JobManager_1.JobManager.createJob(enrichedRequest, userId, projectId);
        logger.info({ jobId: job.id, status: job.status, capabilities: selectedCapabilities }, 'Job created with QUEUED status');
        this.wsService.broadcast('job.started', { jobId: job.id, request: enrichedRequest, ts: new Date().toISOString() });
        void this.executeJobInBackground(job.id, enrichedRequest, userId, projectId).catch((error) => {
            logger.error({ jobId: job.id, error: error.message }, 'Background job execution failed');
        });
        return job;
    }
    /**
     * Executes a job in the background.
     * Updates job state, emits events, and handles failures without throwing to caller.
     */
    async executeJobInBackground(jobId, request, userId, projectId) {
        try {
            const job = await JobManager_1.JobManager.getJob(jobId);
            if (!job) {
                logger.error({ jobId }, 'Job not found during background execution');
                return;
            }
            const decision = PolicyEngine_1.policyEngine.evaluateJob(request, {
                userPermissions: ['jobs:create', 'jobs:high-risk'],
                projectPolicy: 'DEFAULT',
                modelEndpoint: process.env.OLLAMA_BASE_URL,
                executionEnvironment: process.env.SOVEREIGN_MODE === 'true' ? 'PRIVATE_LAN' : 'LOCAL',
                inputSensitivity: 'INTERNAL',
                sovereignMode: process.env.SOVEREIGN_MODE === 'true',
                sandboxAvailable: process.env.DOCKER_AVAILABLE === 'true',
                requiredCapabilities: request.capabilities,
                demoMode: process.env.DEMO_MODE === 'true'
            });
            if (!decision.allowed) {
                await JobManager_1.JobManager.updateJobStatus(jobId, 'BLOCKED');
                this.wsService.broadcast('job.failed', {
                    jobId,
                    reason: decision.reasons.join('; '),
                    ts: new Date().toISOString()
                });
                logger.info({ jobId, reason: decision.reasons.join('; ') }, 'Job blocked by policy');
                return;
            }
            await JobManager_1.JobManager.updateJobStatus(jobId, 'RUNNING');
            this.wsService.broadcast('job.running', { jobId, ts: new Date().toISOString() });
            const plan = Planner_1.Planner.createPlan(jobId, request);
            const safePlan = plan.map((node, index) => ({
                ...node,
                id: node.id || `${jobId}-node-${index}`,
                jobId,
                state: node.state ?? 'QUEUED',
            }));
            await JobManager_1.JobManager.updateJobNodes(jobId, safePlan);
            await JobManager_1.JobManager.updateJobStatus(jobId, 'RUNNING');
            this.wsService.broadcast('job.plan_created', { jobId, plan: safePlan, ts: new Date().toISOString() });
            logger.info({ jobId, nodeCount: safePlan.length }, 'Execution plan created');
            for (const node of safePlan) {
                const nodeResult = await this.executeNode(jobId, node, request);
                if (nodeResult.state === 'BLOCKED' || nodeResult.state === 'FAILED') {
                    await JobManager_1.JobManager.updateJobStatus(jobId, 'FAILED');
                    this.wsService.broadcast('job.failed', {
                        jobId,
                        nodeId: node.id,
                        nodeType: node.type,
                        reason: nodeResult.failureReason,
                        ts: new Date().toISOString()
                    });
                    logger.info({ jobId, nodeId: node.id, reason: nodeResult.failureReason }, 'Job failed at node execution');
                    return;
                }
            }
            const canonical = JSON.stringify({
                id: jobId,
                request,
                nodes: safePlan.map(n => ({
                    id: n.id,
                    type: n.type,
                    state: n.state,
                    inputsHash: n.inputsHash,
                    outputsHash: n.outputsHash
                }))
            });
            const hashResult = (0, Verifier_1.verifyHash)(canonical, (0, crypto_1.createHash)('sha256').update(canonical).digest('hex'));
            const nodeVerificationResults = safePlan.map((node) => ({
                verifierId: `node-verifier:${node.id}`,
                type: 'PROVENANCE',
                status: node.state === 'VERIFIED' && node.outputsHash ? 'PASS' : 'FAIL',
                evidence: {
                    nodeId: node.id,
                    nodeType: node.type,
                    state: node.state,
                    outputsHash: node.outputsHash
                },
                failureReason: node.state === 'VERIFIED' && node.outputsHash ? undefined : `Node ${node.type} did not complete a verified output`,
                version: '1.0.0'
            }));
            const gate = (0, Verifier_1.verificationGate)([
                ...nodeVerificationResults,
                hashResult
            ]);
            const finalStatus = gate.canProceed ? 'COMPLETED' : 'BLOCKED';
            await JobManager_1.JobManager.updateJobStatus(jobId, finalStatus);
            this.wsService.broadcast(finalStatus === 'COMPLETED' ? 'job.completed' : 'job.failed', {
                jobId,
                verdict: gate.verdict,
                ts: new Date().toISOString()
            });
            logger.info({ jobId, status: finalStatus }, 'Job execution completed');
        }
        catch (error) {
            logger.error({ jobId, error: error.message, stack: error.stack }, 'Unexpected error during job execution');
            try {
                await JobManager_1.JobManager.updateJobStatus(jobId, 'FAILED');
                this.wsService.broadcast('job.failed', {
                    jobId,
                    reason: 'Unexpected internal error: ' + error.message,
                    ts: new Date().toISOString()
                });
            }
            catch (updateError) {
                logger.error({ jobId, error: updateError }, 'Failed to update job status after error');
            }
        }
    }
    async executeNode(jobId, node, request) {
        const startedAt = new Date();
        const runningState = 'RUNNING';
        this.wsService.broadcast('node.started', { jobId, nodeId: node.id, type: node.type, state: runningState, ts: startedAt.toISOString() });
        node.state = runningState;
        node.updatedAt = startedAt;
        try {
            let output = { nodeType: node.type, jobId, requestIntent: request.intent, startedAt: startedAt.toISOString() };
            if (node.type === 'ASME_CALCULATION') {
                // Extract parameters from request - NO HARDCODING
                const rawInput = request.rawInput || {};
                const designPressureMPa = typeof rawInput.designPressureMPa === 'number' ? rawInput.designPressureMPa : undefined;
                const outsideDiameterMM = typeof rawInput.outsideDiameterMM === 'number' ? rawInput.outsideDiameterMM : undefined;
                const allowableStressMPa = typeof rawInput.allowableStressMPa === 'number' ? rawInput.allowableStressMPa : undefined;
                const weldJointFactor = typeof rawInput.weldJointFactor === 'number' ? rawInput.weldJointFactor : 1.0;
                const yCoefficient = typeof rawInput.yCoefficient === 'number' ? rawInput.yCoefficient : 0.4;
                const measuredThicknessMM = typeof rawInput.measuredThicknessMM === 'number' ? rawInput.measuredThicknessMM : undefined;
                // Check for missing required parameters
                const missingParams = [];
                if (designPressureMPa === undefined)
                    missingParams.push('designPressureMPa');
                if (outsideDiameterMM === undefined)
                    missingParams.push('outsideDiameterMM');
                if (allowableStressMPa === undefined)
                    missingParams.push('allowableStressMPa');
                if (missingParams.length > 0) {
                    node.state = 'NEEDS_INPUT';
                    node.updatedAt = new Date();
                    node.failureReason = 'Missing required parameters: ' + missingParams.join(', ');
                    const job = await JobManager_1.JobManager.getJob(jobId);
                    if (job) {
                        await JobManager_1.JobManager.updateJobNodes(jobId, job.nodes);
                    }
                    this.wsService.broadcast('node.needs_input', {
                        jobId,
                        nodeId: node.id,
                        type: node.type,
                        state: node.state,
                        missingFields: missingParams,
                        ts: new Date().toISOString()
                    });
                    return { ...node, state: 'NEEDS_INPUT', failureReason: node.failureReason };
                }
                // Validate ranges
                if (designPressureMPa <= 0)
                    throw new Error('designPressureMPa must be positive');
                if (outsideDiameterMM <= 0)
                    throw new Error('outsideDiameterMM must be positive');
                if (allowableStressMPa <= 0)
                    throw new Error('allowableStressMPa must be positive');
                if (weldJointFactor < 0 || weldJointFactor > 1)
                    throw new Error('weldJointFactor must be between 0 and 1');
                const toolInput = {
                    designPressureMPa,
                    outsideDiameterMM,
                    allowableStressMPa,
                    weldJointFactor,
                    yCoefficient,
                    measuredThicknessMM
                };
                const res = await ToolGateway_1.toolGateway.execute('asme-b31-3-pipe-thickness', toolInput, ['tools:engineering']);
                output = res.result;
                // Perform independent mathematical verification
                const { verifyMath } = await Promise.resolve().then(() => __importStar(require('../verification/Verifier')));
                const expectedTMin = (designPressureMPa * outsideDiameterMM) / (2 * (allowableStressMPa * weldJointFactor + designPressureMPa * yCoefficient));
                const mathCheck = verifyMath({
                    computed: output.minimumRequiredThicknessMM,
                    expected: parseFloat(expectedTMin.toFixed(4)),
                    tolerancePct: 0.1 // 0.1% tolerance for floating point
                });
                if (mathCheck.status !== 'PASS') {
                    throw new Error('VERIFICATION_FAILED: ' + mathCheck.failureReason);
                }
            }
            if (node.type === 'POLICY_PRECHECK') {
                output = { policyStatus: 'ALLOW', requiredCapabilities: request.capabilities };
            }
            const inputsHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify({ jobId, nodeType: node.type, startedAt: startedAt.toISOString(), capability: request.capabilities.join(',') })).digest('hex');
            const outputsHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify(output)).digest('hex');
            node.inputsHash = inputsHash;
            node.outputsHash = outputsHash;
            node.state = 'VERIFIED';
            node.updatedAt = new Date();
            // Emit completion event with jobId
            this.wsService.broadcast('node.completed', { jobId, nodeId: node.id, type: node.type, state: node.state, outputsHash, ts: new Date().toISOString() });
            // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
            // Just persist the updated job with current node state
            const job = await JobManager_1.JobManager.getJob(jobId);
            if (job) {
                await JobManager_1.JobManager.updateJobNodes(jobId, job.nodes);
            }
            return { ...node, state: node.state };
        }
        catch (error) {
            const reason = error?.message ?? 'Execution failed';
            node.state = 'FAILED';
            node.updatedAt = new Date();
            // Emit failure event with jobId
            this.wsService.broadcast('node.failed', { jobId, nodeId: node.id, type: node.type, state: node.state, failureReason: reason, ts: new Date().toISOString() });
            // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
            const job = await JobManager_1.JobManager.getJob(jobId);
            if (job) {
                await JobManager_1.JobManager.updateJobNodes(jobId, job.nodes);
            }
            return { state: 'FAILED', failureReason: reason };
        }
    }
}
exports.ExecutionGraph = ExecutionGraph;
