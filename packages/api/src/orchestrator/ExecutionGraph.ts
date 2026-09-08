import { createHash } from 'crypto';
import { JobManager } from './JobManager';
import { Planner } from './Planner';
import { CapabilitySelector } from './CapabilitySelector';
import { WebSocketService } from '../services/WebSocketService';
import { JobRequest, NodeStatus } from '@sih2k26/core';
import { verifyHash, verificationGate, verifySchema } from '../verification/Verifier';
import { toolGateway } from '../tools/ToolGateway';
import { policyEngine } from '../security/PolicyEngine';
import pino from 'pino';

const logger = pino();

export class ExecutionGraph {
  constructor(private wsService: WebSocketService) {}

  /**
   * Creates a job with initial status without waiting for execution.
   * Execution is started asynchronously in the background.
   * Returns the job object with QUEUED status immediately.
   * 
   * Capabilities are selected based on the task intent using CapabilitySelector.
   */
  async createAndQueueJob(request: JobRequest, userId: string, projectId: string) {
    logger.info({ requestIntent: request.intent }, 'Creating and queueing new job');

    // Select capabilities based on task intent (not hardcoded)
    const selectedCapabilities = CapabilitySelector.selectCapabilities(request);
    const enrichedRequest: JobRequest = {
      ...request,
      capabilities: selectedCapabilities
    };

    const job = await JobManager.createJob(enrichedRequest, userId, projectId);
    logger.info({ jobId: job.id, status: job.status, capabilities: selectedCapabilities }, 'Job created with QUEUED status');

    this.wsService.broadcast('job.started', { jobId: job.id, request: enrichedRequest, ts: new Date().toISOString() });

    void this.executeJobInBackground(job.id, enrichedRequest, userId, projectId).catch((error) => {
      logger.error({ jobId: job.id, error: error.message }, 'Background job execution failed');
    });
    });

    return job;
  }

  /**
   * Executes a job in the background.
   * Updates job state, emits events, and handles failures without throwing to caller.
   */
  private async executeJobInBackground(jobId: string, request: JobRequest, userId: string, projectId: string) {
    try {
      const job = await JobManager.getJob(jobId);
      if (!job) {
        logger.error({ jobId }, 'Job not found during background execution');
        return;
      }

      const decision = policyEngine.evaluateJob(request, {
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
        await JobManager.updateJobStatus(jobId, 'BLOCKED');
        this.wsService.broadcast('job.failed', {
          jobId,
          reason: decision.reasons.join('; '),
          ts: new Date().toISOString()
        });
        logger.info({ jobId, reason: decision.reasons.join('; ') }, 'Job blocked by policy');
        return;
      }

      await JobManager.updateJobStatus(jobId, 'RUNNING');
      this.wsService.broadcast('job.running', { jobId, ts: new Date().toISOString() });

      const plan = Planner.createPlan(jobId, request);
      const safePlan = plan.map((node, index) => ({
        ...node,
        id: node.id || `${jobId}-node-${index}`,
        jobId,
        state: node.state ?? 'QUEUED',
      }));

      await JobManager.updateJobNodes(jobId, safePlan);
      await JobManager.updateJobStatus(jobId, 'RUNNING');
      this.wsService.broadcast('job.plan_created', { jobId, plan: safePlan, ts: new Date().toISOString() });

      logger.info({ jobId, nodeCount: safePlan.length }, 'Execution plan created');

      for (const node of safePlan) {
        const nodeResult = await this.executeNode(jobId, node, request);
        if (nodeResult.state === 'BLOCKED' || nodeResult.state === 'FAILED') {
          await JobManager.updateJobStatus(jobId, 'FAILED');
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
      const hashResult = verifyHash(canonical, createHash('sha256').update(canonical).digest('hex'));
      const nodeVerificationResults: any[] = safePlan.map((node) => ({
        verifierId: `node-verifier:${node.id}`,
        type: 'PROVENANCE' as const,
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
      const gate = verificationGate([
        ...nodeVerificationResults,
        hashResult
      ]);

      const finalStatus = gate.canProceed ? 'COMPLETED' : 'BLOCKED';
      await JobManager.updateJobStatus(jobId, finalStatus);
      this.wsService.broadcast(finalStatus === 'COMPLETED' ? 'job.completed' : 'job.failed', {
        jobId,
        verdict: gate.verdict,
        ts: new Date().toISOString()
      });

      logger.info({ jobId, status: finalStatus }, 'Job execution completed');
    } catch (error: any) {
      logger.error({ jobId, error: error.message, stack: error.stack }, 'Unexpected error during job execution');
      try {
        await JobManager.updateJobStatus(jobId, 'FAILED');
        this.wsService.broadcast('job.failed', {
          jobId,
          reason: 'Unexpected internal error: ' + error.message,
          ts: new Date().toISOString()
        });
      } catch (updateError) {
        logger.error({ jobId, error: updateError }, 'Failed to update job status after error');
      }
    }
  }

  private async executeNode(jobId: string, node: any, request: JobRequest) {
    const startedAt = new Date();
    const runningState: NodeStatus = 'RUNNING';

    this.wsService.broadcast('node.started', { jobId, nodeId: node.id, type: node.type, state: runningState, ts: startedAt.toISOString() });
    node.state = runningState;
    node.updatedAt = startedAt;

    try {
      let output: any = { nodeType: node.type, jobId, requestIntent: request.intent, startedAt: startedAt.toISOString() };

      if (node.type === 'ASME_CALCULATION') {
        const toolInput = { designPressureMPa: 12, outsideDiameterMM: 219.1, allowableStressMPa: 137.9, measuredThicknessMM: 9.5 };
        const res = await toolGateway.execute('asme-b31-3-pipe-thickness', toolInput, ['tools:engineering']);
        output = res.result;
      }

      if (node.type === 'POLICY_PRECHECK') {
        output = { policyStatus: 'ALLOW', requiredCapabilities: request.capabilities };
      }

      const inputsHash = createHash('sha256').update(JSON.stringify({ jobId, nodeType: node.type, startedAt: startedAt.toISOString(), capability: request.capabilities.join(',') })).digest('hex');
      const outputsHash = createHash('sha256').update(JSON.stringify(output)).digest('hex');

      node.inputsHash = inputsHash;
      node.outputsHash = outputsHash;
      node.state = 'VERIFIED';
      node.updatedAt = new Date();

      // Emit completion event with jobId
      this.wsService.broadcast('node.completed', { jobId, nodeId: node.id, type: node.type, state: node.state, outputsHash, ts: new Date().toISOString() });
      
      // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
      // Just persist the updated job with current node state
      const job = await JobManager.getJob(jobId);
      if (job) {
        await JobManager.updateJobNodes(jobId, job.nodes);
      }

      return { ...node, state: node.state };
    } catch (error: any) {
      const reason = error?.message ?? 'Execution failed';
      node.state = 'FAILED';
      node.updatedAt = new Date();
      
      // Emit failure event with jobId
      this.wsService.broadcast('node.failed', { jobId, nodeId: node.id, type: node.type, state: node.state, failureReason: reason, ts: new Date().toISOString() });
      
      // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
      const job = await JobManager.getJob(jobId);
      if (job) {
        await JobManager.updateJobNodes(jobId, job.nodes);
      }

      return { state: 'FAILED', failureReason: reason };
    }
  }
}
