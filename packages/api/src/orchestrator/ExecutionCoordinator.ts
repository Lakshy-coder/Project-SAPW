import { ExecutionGraph } from './ExecutionGraph';

let executionGraphInstance: ExecutionGraph | null = null;

export function setExecutionGraph(g: ExecutionGraph) {
  executionGraphInstance = g;
}

export function getExecutionGraph(): ExecutionGraph | null {
  return executionGraphInstance;
}

export async function enqueueExecution(jobId: string, request: any, userId: string, projectId: string) {
  if (!executionGraphInstance) {
    // Not initialized yet — can't start execution now. Caller may retry.
    return false;
  }

  // Ensure async non-blocking behavior
  executionGraphInstance.runJob(jobId, request, userId, projectId);
  return true;
}

export function hasExecutor() {
  return executionGraphInstance !== null;
}

export default { setExecutionGraph, getExecutionGraph, enqueueExecution, hasExecutor };
