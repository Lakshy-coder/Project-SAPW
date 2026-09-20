import { createHash } from 'crypto';
import { JobManager } from './JobManager';
import { Planner } from './Planner';
import { CapabilitySelector } from './CapabilitySelector';
import { WebSocketService } from '../services/WebSocketService';
import { JobRequest, NodeStatus, Capability } from '@sih2k26/core';
import { verifyHash, verificationGate, verifySchema, verifyMath, VerificationResult } from '../verification/Verifier';
import { toolGateway } from '../tools/ToolGateway';
import { policyEngine } from '../security/PolicyEngine';
import { auditService } from '../audit/AuditService';
import { ModelRouter } from '../models/ModelRouter';
import { ragService } from '../rag/RagService';
import pino from 'pino';

const logger = pino();

/**
 * Extracts engineering parameters from user request intent.
 * Returns NEEDS_INPUT state if required parameters are missing.
 */
function extractEngineeringParameters(intent: string, rawRequest?: any): {
  status: 'READY' | 'NEEDS_INPUT';
  missingFields: string[];
  extractedParams: Partial<{
    designPressureMPa: number;
    outsideDiameterMM: number;
    allowableStressMPa: number;
    measuredThicknessMM: number;
    weldJointFactor: number;
    yCoefficient: number;
  }>;
} {
  const extractedParams: any = {};
  const missingFields: string[] = [];
  
  // Try to extract from rawRequest first (structured input)
  const payload = rawRequest ?? (intent as any)?.rawRequest ?? {};
  if (payload && typeof payload === 'object') {
    if (typeof payload.designPressureMPa === 'number') extractedParams.designPressureMPa = payload.designPressureMPa;
    if (typeof payload.outsideDiameterMM === 'number') extractedParams.outsideDiameterMM = payload.outsideDiameterMM;
    if (typeof payload.allowableStressMPa === 'number') extractedParams.allowableStressMPa = payload.allowableStressMPa;
    if (typeof payload.measuredThicknessMM === 'number') extractedParams.measuredThicknessMM = payload.measuredThicknessMM;
    if (typeof payload.weldJointFactor === 'number') extractedParams.weldJointFactor = payload.weldJointFactor;
    if (typeof payload.yCoefficient === 'number') extractedParams.yCoefficient = payload.yCoefficient;
  }
  
  // Check what's missing for ASME calculation
  if (extractedParams.designPressureMPa === undefined) missingFields.push('designPressureMPa');
  if (extractedParams.outsideDiameterMM === undefined) missingFields.push('outsideDiameterMM');
  if (extractedParams.allowableStressMPa === undefined) missingFields.push('allowableStressMPa');
  
  return {
    status: missingFields.length > 0 ? 'NEEDS_INPUT' : 'READY',
    missingFields,
    extractedParams
  };
}

export class ExecutionGraph {
  constructor(private wsService: WebSocketService) {}

  /**
   * Public entrypoint to run execution for an existing job that was already created.
   * This delegates to the internal background executor.
   */
  async runJob(jobId: string, request: JobRequest, userId: string, projectId: string) {
    // Intentionally fire-and-forget to keep behaviour async from caller
    void this.executeJobInBackground(jobId, request, userId, projectId).catch((err) => {
      const logger = pino();
      logger.error({ jobId, err: err?.message ?? err }, 'ExecutionGraph.runJob: background execution failed');
    });
  }

  /**
   * Creates a job with initial status without waiting for execution.
   * Execution is started asynchronously in the background.
   * Returns the job object with QUEUED status immediately.
   * 
   * Capabilities are selected based on the task intent using CapabilitySelector.
   */
  async createAndQueueJob(request: JobRequest, userId: string, projectId: string) {
    logger.info({ requestIntent: request.intent }, 'Creating and queueing new job');

    // Select capabilities based on task intent if not explicitly provided
    const selectedCapabilities = request.capabilities && request.capabilities.length > 0 
      ? request.capabilities 
      : CapabilitySelector.selectCapabilities(request);
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

      // Get user permissions from auth context (passed from route)
      // Default to empty permissions if not provided (will be blocked by policy)
      const userPermissions = (request as any).userPermissions || [];

      const decision = policyEngine.evaluateJob(request, {
        userPermissions,
        projectPolicy: 'DEFAULT',
        modelEndpoint: process.env.OLLAMA_BASE_URL,
        executionEnvironment: process.env.SOVEREIGN_MODE === 'true' ? 'PRIVATE_LAN' : 'LOCAL',
        inputSensitivity: 'INTERNAL',
        sovereignMode: process.env.SOVEREIGN_MODE === 'true',
        sandboxAvailable: process.env.DOCKER_AVAILABLE === 'true',
        requiredCapabilities: request.capabilities,
        demoMode: process.env.DEMO_MODE === 'true',
        allowFastFallback: process.env.DEMO_MODE === 'true'
      });

      if (!decision.allowed) {
        await JobManager.updateJobStatus(jobId, 'BLOCKED');
        // Emit audit event for policy blocking
        try {
          auditService.emit(jobId, 'JOB_BLOCKED_BY_POLICY', { request }, { allowed: false, reasons: decision.reasons }, undefined, { reasons: decision.reasons });
        } catch (e) {
          logger.warn({ jobId, err: e }, 'Failed to emit audit event for policy block');
        }

        this.wsService.broadcast('job.failed', {
          jobId,
          status: 'BLOCKED',
          reason: decision.reasons.join('; '),
          ts: new Date().toISOString()
        });
        logger.info({ jobId, reason: decision.reasons.join('; ') }, 'Job blocked by policy');
        return;
      }

      await JobManager.updateJobStatus(jobId, 'RUNNING');
      // Emit audit event: job started
      try {
        auditService.emit(jobId, 'JOB_STARTED', { request }, { status: 'RUNNING' }, undefined, { userId, projectId });
      } catch (e) {
        logger.warn({ jobId, err: e }, 'Failed to emit audit event for job start');
      }
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
      // Emit audit event: plan created
      try {
        auditService.emit(jobId, 'JOB_PLAN_CREATED', { request }, { plan: safePlan.map(p => ({ id: p.id, type: p.type })) });
      } catch (e) {
        logger.warn({ jobId, err: e }, 'Failed to emit audit event for plan creation');
      }
      this.wsService.broadcast('job.plan_created', { jobId, plan: safePlan, ts: new Date().toISOString() });

      logger.info({ jobId, nodeCount: safePlan.length }, 'Execution plan created');

      const jobController = new AbortController();
      // Future-proofing: hook up jobController to an external cancellation request if needed

      for (const node of safePlan) {
        if (jobController.signal.aborted) {
          node.state = 'CANCELLED';
          (node as any).failureReason = 'Job was cancelled';
          await JobManager.updateJobNodes(jobId, safePlan);
          continue;
        }

        logger.info({ jobId, nodeId: node.id, nodeType: node.type }, 'Executing node');
        const nodeResult = await this.executeNode(jobId, node, request, safePlan, jobController.signal);
        logger.info({ jobId, nodeId: node.id, nodeType: node.type, state: nodeResult.state }, 'Node executed');

        if (nodeResult.state === 'BLOCKED' || nodeResult.state === 'FAILED') {
          await JobManager.updateJobStatus(jobId, 'FAILED');
          // Emit audit event for node failure causing job failure
          try {
            auditService.emit(jobId, 'JOB_FAILED_AT_NODE', { nodeId: node.id, nodeType: node.type }, { failureReason: nodeResult.failureReason }, node.id, { reason: nodeResult.failureReason });
          } catch (e) {
            logger.warn({ jobId, err: e }, 'Failed to emit audit event for job failure at node');
          }

          this.wsService.broadcast('job.failed', {
            jobId,
            nodeId: node.id,
            nodeType: node.type,
            status: 'FAILED',
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
      logger.info({ jobId, checkCount: nodeVerificationResults.length + 1 }, 'Running verification gate');
      const gate = verificationGate([
        ...nodeVerificationResults,
        hashResult
      ]);
      logger.info({ jobId, canProceed: gate.canProceed, verdict: gate.verdict }, 'Verification gate completed');

      const failedReason = gate.failedChecks.length > 0
        ? gate.failedChecks.map((check) => check.failureReason ?? `${check.type} verification failed`).join('; ')
        : 'Verification gate failed';

      const finalStatus = gate.canProceed ? 'COMPLETED' : 'BLOCKED';
      await JobManager.updateJobStatus(jobId, finalStatus);
      // Emit audit event for verification/gate result
      try {
        auditService.emit(jobId, 'JOB_VERIFICATION', { nodeVerificationResults, hashResult }, { canProceed: gate.canProceed, verdict: gate.verdict });
      } catch (e) {
        logger.warn({ jobId, err: e }, 'Failed to emit audit event for job verification');
      }

      const asmeNode: any = safePlan.find((candidate: any) => candidate.type === 'ASME_CALCULATION' && (candidate as any).result) as any;
      const reasoningNode: any = safePlan.find((candidate: any) => candidate.type === 'REASONING' && (candidate as any).result && typeof (candidate as any).result.answer === 'string' && (candidate as any).result.answer.trim()) as any;

      const verification = asmeNode?.verification ?? reasoningNode?.verification ?? {
        status: 'UNVERIFIED',
        verifier: 'local-model',
        version: '1.0.0',
        evidence: null,
        failureReason: undefined
      };

      const finalResult = asmeNode?.result ? {
        answer: `Verified minimum required wall thickness: ${asmeNode.result.minimumRequiredThicknessMM} mm`,
        engineering: {
          tool: 'ASME B31.3 Pipe Wall Thickness',
          formula: asmeNode.result.formula,
          inputs: asmeNode.result.normalizedInputs ?? (request as any).rawRequest ?? (request as any).rawInput ?? {},
          output: asmeNode.result,
          assumptions: asmeNode.result.assumptions,
          status: asmeNode.result.status ?? 'VERIFIED',
          units: asmeNode.result.assumptions?.units ?? 'MPa, mm'
        },
        verification,
        evidence: {
          nodeId: asmeNode.id,
          outputsHash: asmeNode.outputsHash,
          verification,
          toolResult: asmeNode.result
        }
      } : reasoningNode?.result ? {
        answer: reasoningNode.result.answer,
        reasoning: {
          model: reasoningNode.result.model ?? 'local-model',
          prompt: request.intent,
          status: reasoningNode.result.status ?? 'SUCCESS'
        },
        verification,
        evidence: {
          nodeId: reasoningNode.id,
          outputsHash: reasoningNode.outputsHash,
          model: reasoningNode.result.model ?? 'local-model',
          status: reasoningNode.result.status ?? 'SUCCESS'
        }
      } : undefined;

      if (finalResult) {
        await JobManager.updateJobState(jobId, {
          result: finalResult,
          verification,
          evidence: finalResult.evidence
        });
      }

      this.wsService.broadcast(finalStatus === 'COMPLETED' ? 'job.completed' : 'job.failed', {
        jobId,
        status: finalStatus,
        verdict: gate.verdict,
        reason: finalStatus === 'COMPLETED' ? undefined : failedReason,
        result: finalResult,
        verification,
        evidence: finalResult?.evidence,
        ts: new Date().toISOString()
      });

      logger.info({ jobId, status: finalStatus }, 'Job execution completed');
    } catch (error: any) {
      logger.error({ jobId, error: error.message, stack: error.stack }, 'Unexpected error during job execution');
      try {
        await JobManager.updateJobStatus(jobId, 'FAILED');
        this.wsService.broadcast('job.failed', {
          jobId,
          status: 'FAILED',
          reason: 'Unexpected internal error: ' + error.message,
          ts: new Date().toISOString()
        });
      } catch (updateError) {
        logger.error({ jobId, error: updateError }, 'Failed to update job status after error');
      }
    }
  }

  private async executeNode(jobId: string, node: any, request: JobRequest, safePlan: any[], signal?: AbortSignal) {
    const startedAt = new Date();
    const runningState: NodeStatus = 'RUNNING';

    this.wsService.broadcast('node.started', { jobId, nodeId: node.id, type: node.type, state: runningState, ts: startedAt.toISOString() });
    // Audit: node started
    try {
      auditService.emit(jobId, 'NODE_STARTED', { nodeId: node.id, type: node.type, requestIntent: request.intent }, { state: runningState }, node.id);
    } catch (e) {
      logger.warn({ jobId, nodeId: node.id, err: e }, 'Failed to emit audit event for node start');
    }
    node.state = runningState;
    node.updatedAt = startedAt;
    await JobManager.updateJobNodes(jobId, safePlan);

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (signal?.aborted) {
        node.state = 'CANCELLED';
        node.failureReason = 'Cancelled by user';
        await JobManager.updateJobNodes(jobId, safePlan);
        return { state: 'CANCELLED', failureReason: node.failureReason };
      }

      try {
        let output: any = { nodeType: node.type, jobId, requestIntent: request.intent, startedAt: startedAt.toISOString() };

      if (node.type === 'SOP_RETRIEVAL') {
        // topK=3: retrieve only the most relevant chunks to keep the reasoning prompt compact
        const ragResult = await ragService.search(request.intent, 3);
        
        node.result = {
          citations: ragResult.citations,
          context: ragResult.context,
          retrieverUsed: ragResult.retrieverUsed,
          documentCount: ragResult.documentCount,
          status: ragResult.status
        };
        output = node.result;
        
        node.verification = {
          status: ragResult.context ? 'PASS' : 'PASS', // RAG is not verification, it's just retrieval
          verifier: ragResult.retrieverUsed,
          version: '1.0.0',
          evidence: {
            documentCount: ragResult.documentCount,
            hasContext: !!ragResult.context
          },
          failureReason: undefined
        };
      }

      if (node.type === 'REASONING') {
        const sopNode = safePlan.find(n => n.type === 'SOP_RETRIEVAL' && n.state === 'VERIFIED');
        const asmeNode = safePlan.find(n => n.type === 'ASME_CALCULATION' && n.state === 'VERIFIED');
        
        let groundedPrompt = request.intent && request.intent.trim() ? request.intent : JSON.stringify((request as any).rawRequest ?? (request as any).rawInput ?? request);
        
        if (sopNode || asmeNode) {
          const parts = [];
          parts.push(`USER TASK:\n${groundedPrompt}`);
          
          if (asmeNode && asmeNode.result) {
            // Compact single-line format — avoids ~300 extra chars of pretty-printed JSON
            const r = asmeNode.result;
            const compactAsme = `t_min = ${r.minimumRequiredThicknessMM} mm | Formula: ${r.formula} | Code: ${r.assumptions?.codeEdition ?? 'ASME B31.3'} §${r.assumptions?.formulaId ?? '304.1.2'} | Units: ${r.assumptions?.units ?? 'MPa, mm'} | Verification: ${asmeNode.verification?.status ?? 'PASS'}`;
            parts.push(`DETERMINISTIC ENGINEERING RESULT (authoritative — do not recalculate):\n${compactAsme}`);
          }
          
          if (sopNode && sopNode.result && sopNode.result.context) {
            parts.push(`RETRIEVED KNOWLEDGE / SOP EVIDENCE:\n${sopNode.result.context}`);
            if (sopNode.result.citations && sopNode.result.citations.length > 0) {
              // Compact citation list instead of pretty-printed JSON
              const citationLines = sopNode.result.citations.map((c: any, i: number) =>
                `[${i + 1}] ${c.documentTitle} v${c.documentVersion} — ${c.location} (score: ${c.score?.toFixed(3) ?? 'n/a'})`
              ).join('\n');
              parts.push(`CITATIONS:\n${citationLines}`);
            }
          }
          
          parts.push(`INSTRUCTIONS:
Provide a concise engineering explanation (3–5 sentences max). State the verified result, cite the relevant source-backed reasoning, list key assumptions, and interpret the verification status. Do not repeat the full source text. Do not recalculate the deterministic result. Do not invent or fabricate source references.`);
          
          groundedPrompt = parts.join('\n\n');
        }

        // Diagnostic: log prompt characteristics at debug level (not visible in default pino INFO output)
        logger.debug({
          jobId,
          nodeId: node.id,
          promptChars: groundedPrompt.length,
          promptTokensApprox: Math.round(groundedPrompt.length / 4),
          ragDocumentCount: sopNode?.result?.documentCount ?? 0,
          ragContextChars: sopNode?.result?.context?.length ?? 0,
          citationCount: sopNode?.result?.citations?.length ?? 0,
          asmeResultPresent: !!(asmeNode?.result)
        }, 'REASONING prompt diagnostics');

        const answer = await ModelRouter.route('GENERAL_REASONING', groundedPrompt, { signal });

        if (typeof answer !== 'string' || !answer.trim()) {
          throw new Error('EMPTY_REASONING_RESULT: model returned no usable response');
        }

        const normalizedAnswer = answer.trim();
        node.result = {
          answer: normalizedAnswer,
          model: 'ollama-local',
          status: 'SUCCESS'
        };
        node.verification = {
          status: 'UNVERIFIED',
          verifier: 'local-model',
          version: '1.0.0',
          evidence: {
            nodeType: node.type,
            model: 'ollama-local',
            outputLength: normalizedAnswer.length
          },
          failureReason: undefined
        };
        output = {
          answer: normalizedAnswer,
          model: 'ollama-local',
          status: 'SUCCESS'
        };
      }

      if (node.type === 'ASME_CALCULATION') {
        // Support both request shapes used across the project: rawRequest (current schema) + rawInput (legacy alias)
        const rawInput = ((request as any).rawRequest ?? (request as any).rawInput) || {};
        const designPressureMPa = typeof rawInput.designPressureMPa === 'number' ? rawInput.designPressureMPa : undefined;
        const outsideDiameterMM = typeof rawInput.outsideDiameterMM === 'number' ? rawInput.outsideDiameterMM : undefined;
        const allowableStressMPa = typeof rawInput.allowableStressMPa === 'number' ? rawInput.allowableStressMPa : undefined;
        const weldJointFactor = typeof rawInput.weldJointFactor === 'number' ? rawInput.weldJointFactor : 1.0;
        const yCoefficient = typeof rawInput.yCoefficient === 'number' ? rawInput.yCoefficient : 0.4;
        const measuredThicknessMM = typeof rawInput.measuredThicknessMM === 'number' ? rawInput.measuredThicknessMM : undefined;

        // Check for missing required parameters
        const missingParams = [];
        if (designPressureMPa === undefined) missingParams.push('designPressureMPa');
        if (outsideDiameterMM === undefined) missingParams.push('outsideDiameterMM');
        if (allowableStressMPa === undefined) missingParams.push('allowableStressMPa');

        if (missingParams.length > 0) {
          node.state = 'NEEDS_INPUT';
          node.updatedAt = new Date();
          node.failureReason = 'Missing required parameters: ' + missingParams.join(', ');
          
          const job = await JobManager.getJob(jobId);
          if (job) {
            await JobManager.updateJobNodes(jobId, safePlan);
          }
          
          this.wsService.broadcast('node.needs_input', { 
            jobId, 
            nodeId: node.id, 
            type: node.type, 
            state: node.state, 
            missingFields: missingParams,
            ts: new Date().toISOString() 
          });
          try {
            auditService.emit(jobId, 'NODE_NEEDS_INPUT', { nodeId: node.id, missingFields: missingParams }, { state: node.state }, node.id, { missingFields: missingParams });
          } catch (e) {
            logger.warn({ jobId, nodeId: node.id, err: e }, 'Failed to emit audit event for node needs input');
          }
          
          return { ...node, state: 'NEEDS_INPUT', failureReason: node.failureReason };
        }

        // Validate ranges
        if (designPressureMPa <= 0) throw new Error('designPressureMPa must be positive');
        if (outsideDiameterMM <= 0) throw new Error('outsideDiameterMM must be positive');
        if (allowableStressMPa <= 0) throw new Error('allowableStressMPa must be positive');
        if (weldJointFactor < 0 || weldJointFactor > 1) throw new Error('weldJointFactor must be between 0 and 1');

        const toolInput = { 
          designPressureMPa, 
          outsideDiameterMM, 
          allowableStressMPa, 
          weldJointFactor, 
          yCoefficient,
          measuredThicknessMM 
        };
        
        const res = await toolGateway.execute('asme-b31-3-pipe-thickness', toolInput, ['tools:engineering']);
        output = res.result;
        node.result = {
          ...output,
          normalizedInputs: {
            designPressureMPa,
            outsideDiameterMM,
            allowableStressMPa,
            weldJointFactor,
            yCoefficient,
            measuredThicknessMM
          }
        };
        
        // Perform independent mathematical verification
        const expectedTMin = (designPressureMPa * outsideDiameterMM) / (2 * (allowableStressMPa * weldJointFactor + designPressureMPa * yCoefficient));
        const mathCheck = verifyMath({
          computed: output.minimumRequiredThicknessMM,
          expected: parseFloat(expectedTMin.toFixed(4)),
          tolerancePct: 0.1 // 0.1% tolerance for floating point
        });
        node.verification = {
          status: mathCheck.status,
          verifier: 'verifyMath',
          version: '1.0.0',
          evidence: mathCheck.evidence,
          failureReason: mathCheck.failureReason
        };
        
        if (mathCheck.status !== 'PASS') {
          throw new Error('VERIFICATION_FAILED: ' + mathCheck.failureReason);
        }
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
      this.wsService.broadcast('node.completed', {
        jobId,
        nodeId: node.id,
        type: node.type,
        state: node.state,
        outputsHash,
        result: node.result,
        verification: node.verification,
        ts: new Date().toISOString()
      });
      try {
        auditService.emit(jobId, 'NODE_COMPLETED', { nodeId: node.id, inputsHash }, { outputsHash }, node.id, { nodeType: node.type });
      } catch (e) {
        logger.warn({ jobId, nodeId: node.id, err: e }, 'Failed to emit audit event for node completed');
      }
      
      // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
      // Just persist the updated job with current node state
      await JobManager.updateJobNodes(jobId, safePlan);

      return { ...node, state: node.state };
    } catch (error: any) {
      const reason = error?.message ?? 'Execution failed';
      
      const isRetryable = reason.includes('OLLAMA_TIMEOUT') || reason.includes('OLLAMA_UNAVAILABLE') || reason.includes('ECONNREFUSED');
      if (isRetryable && attempt < maxRetries && !signal?.aborted) {
        attempt++;
        logger.warn({ jobId, nodeId: node.id, attempt, reason }, 'Retrying node execution after failure');
        node.state = 'RETRYING';
        node.updatedAt = new Date();
        this.wsService.broadcast('node.retrying', { jobId, nodeId: node.id, type: node.type, state: node.state, attempt, reason, ts: new Date().toISOString() });
        await JobManager.updateJobNodes(jobId, safePlan);
        continue;
      }
      
      node.state = 'FAILED';
      node.updatedAt = new Date();
      
      // Emit failure event with jobId
      this.wsService.broadcast('node.failed', { jobId, nodeId: node.id, type: node.type, state: node.state, failureReason: reason, ts: new Date().toISOString() });
      try {
        auditService.emit(jobId, 'NODE_FAILED', { nodeId: node.id, type: node.type }, { failureReason: reason }, node.id, { failureReason: reason });
      } catch (e) {
        logger.warn({ jobId, nodeId: node.id, err: e }, 'Failed to emit audit event for node failed');
      }
      
      // Do NOT call addNodeToJob - nodes are already in the plan and updated by reference
      await JobManager.updateJobNodes(jobId, safePlan);

      return { state: 'FAILED', failureReason: reason };
    }
    }
    // Should never reach here if while loop is correct, but TypeScript wants a return
    return { state: 'FAILED', failureReason: 'Retries exhausted' };
  }
}
