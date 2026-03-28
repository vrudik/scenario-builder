/**
 * Снимок статуса workflow в Temporal (без блокирующего result()).
 */

export type TemporalWorkflowStatusName =
  | 'UNSPECIFIED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'CONTINUED_AS_NEW'
  | 'TIMED_OUT'
  | 'PAUSED'
  | 'UNKNOWN';

export interface ScenarioWorkflowStatusSnapshot {
  workflowId: string;
  runId: string;
  statusName: TemporalWorkflowStatusName;
  taskQueue: string;
  historyLength: number;
  startTime: string;
  closeTime?: string;
}

/** Минимальные поля ответа describe() для маппинга */
export interface WorkflowDescribeLike {
  workflowId: string;
  runId: string;
  taskQueue: string;
  historyLength: number;
  status: { name: TemporalWorkflowStatusName };
  startTime: Date;
  closeTime?: Date;
}

export function mapWorkflowDescribeToSnapshot(desc: WorkflowDescribeLike): ScenarioWorkflowStatusSnapshot {
  return {
    workflowId: desc.workflowId,
    runId: desc.runId,
    statusName: desc.status.name,
    taskQueue: desc.taskQueue,
    historyLength: desc.historyLength,
    startTime: desc.startTime.toISOString(),
    closeTime: desc.closeTime?.toISOString()
  };
}
