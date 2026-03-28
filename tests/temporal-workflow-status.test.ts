import { describe, it, expect } from 'vitest';
import { mapWorkflowDescribeToSnapshot } from '../src/runtime/temporal-workflow-status';

describe('temporal-workflow-status', () => {
  it('mapWorkflowDescribeToSnapshot serializes describe-like payload', () => {
    const start = new Date('2025-01-01T12:00:00.000Z');
    const snap = mapWorkflowDescribeToSnapshot({
      workflowId: 'wf-1',
      runId: 'run-1',
      taskQueue: 'scenario-execution',
      historyLength: 42,
      status: { name: 'RUNNING' },
      startTime: start
    });
    expect(snap).toEqual({
      workflowId: 'wf-1',
      runId: 'run-1',
      statusName: 'RUNNING',
      taskQueue: 'scenario-execution',
      historyLength: 42,
      startTime: start.toISOString(),
      closeTime: undefined
    });
  });

  it('includes closeTime when set', () => {
    const start = new Date('2025-01-01T12:00:00.000Z');
    const close = new Date('2025-01-01T12:01:00.000Z');
    const snap = mapWorkflowDescribeToSnapshot({
      workflowId: 'wf-1',
      runId: 'run-1',
      taskQueue: 'q',
      historyLength: 10,
      status: { name: 'COMPLETED' },
      startTime: start,
      closeTime: close
    });
    expect(snap.closeTime).toBe(close.toISOString());
    expect(snap.statusName).toBe('COMPLETED');
  });
});
