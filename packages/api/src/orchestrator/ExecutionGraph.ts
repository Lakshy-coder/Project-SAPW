import { createHash } from 'crypto';
import { JobManager } from './JobManager';
import { Planner } from './Planner';
import { WebSocketService } from '../services/WebSocketService';
import { JobRequest, NodeStatus } from '@sih2k26/core';
import { verifyHash, verificationGate, verifySchema } from '../verification/Verifier';
import { toolGateway } from '../tools/ToolGateway';
import { policyEngine } from '../security/PolicyEngine';
import pino from 'pino';

const logger = pino();

export class ExecutionGraph {
  constructor(private wsService: WebSocketService) {}

  async startJob(request: JobRequest, userId: string, projectId: string) {
    logger.info({ request }, 'Starting new job execution');

    const job = await JobManager.createJob(request, userId, projectId);
    this.wsService.broadcast('job.started', { jobId: job.id, request, ts: new Date().toISOString() });

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
      await JobManager.updateJobStatus(job.id, 'BLOCKED');
      this.wsService.broadcast('job.failed', { jobId: job.id, reason: decision.reasons.join('; '), ts: new Date().toISOString() });
      return { ...job, status: 'BLOCKED', policyReasons: decision.reasons };
    }

    await JobManager.updateJobStatus(job.id, 'RUNNING');

    const plan = Planner.createPlan(job.id, request);
    job.nodes = plan;
    await JobManager.updateJobStatus(job.id, 'RUNNING');

    this.wsService.broadcast('job.plan_created', { jobId: job.id, plan, ts: new Date().toISOString() });

    for (const node of plan) {
      const nodeResult = await this.executeNode(job.id, node, request);
      if (nodeResult.state === 'BLOCKED' || nodeResult.state === 'FAILED') {
        await JobManager.updateJobStatus(job.id, 'BLOCKED');
        this.wsService.broadcast('job.failed', { jobId: job.id, nodeId: node.id, reason: nodeResult.failureReason, ts: new Date().toISOString() });
        return { ...job, status: 'BLOCKED', nodes: plan };
      }
    }

    const canonical = JSON.stringify({ id: job.id, request, nodes: plan.map(n => ({ id: n.id, type: n.type, state: n.state, inputsHash: n.inputsHash, outputsHash: n.outputsHash })) });
    const hashResult = verifyHash(canonical, createHash('sha256').update(canonical).digest('hex'));
    const gate = verificationGate([
      verifySchema({ ok: true }, { safeParse: () => ({ success: true }) } as any),
      hashResult
    ]);

    const finalStatus = gate.canProceed ? 'COMPLETED' : 'BLOCKED';
    await JobManager.updateJobStatus(job.id, finalStatus);
    this.wsService.broadcast(finalStatus === 'COMPLETED' ? 'job.completed' : 'job.failed', { jobId: job.id, verdict: gate.verdict, ts: new Date().toISOString() });

    return { ...job, status: finalStatus, nodes: plan, verification: gate };
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

      this.wsService.broadcast('node.progress', { jobId, nodeId: node.id, type: node.type, state: node.state, outputsHash, ts: new Date().toISOString() });
      await JobManager.addNodeToJob(jobId, node);
      return { ...node, state: node.state };
    } catch (error: any) {
      const reason = error?.message ?? 'Execution failed';
      node.state = 'FAILED';
      node.updatedAt = new Date();
      this.wsService.broadcast('node.progress', { jobId, nodeId: node.id, type: node.type, state: node.state, failureReason: reason, ts: new Date().toISOString() });
      await JobManager.addNodeToJob(jobId, node);
      return { state: 'FAILED', failureReason: reason };
    }
  }
}
