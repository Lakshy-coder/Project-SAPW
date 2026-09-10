import { JobRequest, ExecutionNode, NodeStatus } from '@sih2k26/core';
import { randomUUID } from 'crypto';

const baseNodeState: NodeStatus = 'QUEUED';

export class Planner {
  static createPlan(jobId: string, request: JobRequest): ExecutionNode[] {
    const nodes: ExecutionNode[] = [];

    const appendNode = (type: string) => {
      nodes.push({
        id: randomUUID(),
        jobId,
        type,
        state: baseNodeState,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    };

    appendNode('INTENT_EXTRACTION');
    appendNode('POLICY_PRECHECK');

    for (const capability of request.capabilities) {
      switch (capability) {
        case 'GENERAL_REASONING':
          appendNode('REASONING');
          break;
        case 'CODE_GENERATION':
          appendNode('CODE_GENERATION');
          break;
        case 'CODE_EXECUTION':
          appendNode('CODE_EXECUTION');
          break;
        case 'VISION_EXTRACTION':
          appendNode('VISION_EXTRACTION');
          break;
        case 'SOP_RETRIEVAL':
          appendNode('SOP_RETRIEVAL');
          break;
        case 'EMBEDDINGS':
          appendNode('EMBEDDINGS');
          break;
        case 'ASME_CALCULATION':
          appendNode('ASME_CALCULATION');
          break;
        case 'DOCUMENT_GENERATION':
          appendNode('DOCUMENT_GENERATION');
          break;
        case 'POLICY_CHECK':
          appendNode('POLICY_CHECK');
          break;
        case 'SIGNED_AUDIT':
          appendNode('SIGNED_AUDIT');
          break;
        default:
          appendNode('CAPABILITY_WORK');
          break;
      }
    }

    appendNode('VERIFICATION_GATE');
    appendNode('EVIDENCE_SEALING');
    appendNode('FINAL_DELIVERY');

    return nodes;
  }
}
