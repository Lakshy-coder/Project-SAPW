import { JobRequest, ExecutionNode, NodeStatus } from '@sih2k26/core';
import { randomUUID } from 'crypto';

export class Planner {
  static createPlan(jobId: string, request: JobRequest): ExecutionNode[] {
    // Basic deterministic planner based on capabilities
    const nodes: ExecutionNode[] = [];
    
    // Always start with a verification of intent
    nodes.push({
      id: randomUUID(),
      jobId,
      type: 'INTENT_VERIFICATION',
      state: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (request.capabilities.includes('SOP_RETRIEVAL')) {
      nodes.push({
        id: randomUUID(),
        jobId,
        type: 'KNOWLEDGE_RETRIEVAL',
        state: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (request.capabilities.includes('ASME_CALCULATION')) {
      nodes.push({
        id: randomUUID(),
        jobId,
        type: 'DETERMINISTIC_CALCULATION',
        state: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Always end with evidence sealing and deliverable generation (simplified)
    nodes.push({
      id: randomUUID(),
      jobId,
      type: 'EVIDENCE_SEALING',
      state: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return nodes;
  }
}
